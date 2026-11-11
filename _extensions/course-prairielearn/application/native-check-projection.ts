import { matchesGlob } from "node:path";
import { NativeProjectCheckSchema } from "./native-checks.ts";
import { selectNativeCompilerInputs } from "./native-selection.ts";
import { selectedCheckFile } from "./native-check-inventory.ts";
import type { SelectedCheckFile } from "./native-check-inventory.ts";
import { safePath } from "./source-selection.ts";
import type * as Core from "course-core/public.ts";
import type {
  ArtifactFile,
  ArtifactFiles,
  NativeProjectFact,
  ProjectPlan,
} from "course-core/public.ts";
import type { NativeProjectCheck } from "./native-checks.ts";
import type { RuntimeProfile } from "./runtime-descriptor.ts";
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
export type CheckedNativeProjectFact = Omit<NativeProjectFact, "check"> & {
  check?: NativeProjectCheck;
};
async function projectReferences(
  selection: Awaited<ReturnType<typeof selectNativeCompilerInputs>>,
  check: NativeProjectCheck,
) {
  const origin = (file: { target: string; bytes: Uint8Array }, name: string) =>
    selectedCheckFile(file, name);
  const primary = new Set(selection.sources.map((f) => f.name));
  const extras = check["additional-java-sources"];
  const references = [];
  for (const ref of selection.references) {
    const names = new Set(ref.files.map((f) => f.name));
    if (
      ref.available &&
      // Явная Java reference-группа без student ZIP policy — полное решение,
      // а не копия списка starter-файлов. Выбор role/hash/limits уже проверен.
      !(!extras &&
        ["java25-junit-v1", "java25-gradle-junit-v1"].includes(
          check.runtime,
        )) &&
      ((!extras && [...names].some((n) => !primary.has(n))) ||
        extras?.["primary-required"] !== false &&
          [...primary].some((n) => !names.has(n)))
    ) {
      throw Error(
        "PL.SELECTION_INVALID: reference primary/helper policy mismatch",
      );
    }
    references.push({
      name: ref.name,
      root: ref.root,
      optional: ref.optional,
      group: ref.group,
      available: ref.available,
      targets: ref.targets,
      sources: await Promise.all(ref.files.map((f) => origin(f, f.name))),
    });
  }
  return references;
}
function contractFixtureFiles(
  file: ArtifactFile,
  target: (name: string) => ArtifactFile,
): SelectedCheckFile[] {
  const contractFixtures: SelectedCheckFile[] = [];
  const origin = (file: { target: string; bytes: Uint8Array }, name: string) =>
    selectedCheckFile(file, name);
  const raw: unknown = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(file.bytes),
  );
  if (!record(raw) || raw.schemaVersion !== 1 || !Array.isArray(raw.cases)) {
    throw Error("PL.VERIFICATION_INVALID: contract cases");
  }
  const ids = new Set<string>();
  const cases: unknown[] = raw.cases;
  for (const value of cases) {
    if (!record(value)) throw Error("PL.VERIFICATION_INVALID: contract case");
    const row = value;
    if (typeof row.id !== "string" || !row.id || ids.has(row.id)) {
      throw Error("PL.VERIFICATION_INVALID: case id");
    }
    ids.add(row.id);
    const mappings: unknown = row.sources ?? [];
    if (!Array.isArray(mappings)) {
      throw Error("PL.VERIFICATION_INVALID: fixture sources");
    }
    for (const item of mappings) {
      if (
        !record(item) || !safePath(item.fixture) ||
        !item.fixture.startsWith("tests/fixtures/") ||
        !safePath(item.submission)
      ) throw Error("PL.VERIFICATION_INVALID: fixture mapping");
      const file = target(item.fixture);
      contractFixtures.push(origin(file, item.submission));
    }
  }
  return contractFixtures;
}
/** Только private projection непосредственно materialized A1 inventories.
 * Это не resolver/reader; все paths/data получены от public Core той же операции.
 */
export async function projectNativeChecks(
  input: {
    Core: Pick<
      typeof Core,
      "ArtifactFilesSchema" | "ProjectPlanSchema" | "ArtifactFileSchema"
    >;
    fact: CheckedNativeProjectFact;
    student: ArtifactFiles;
    full: ArtifactFiles | undefined;
    studentPlan: ProjectPlan;
    fullPlan: ProjectPlan;
    runtime: RuntimeProfile;
    courseId: string;
  },
) {
  const check = NativeProjectCheckSchema.parse(input.fact.check),
    student = input.Core.ArtifactFilesSchema.parse(input.student),
    full = input.Core.ArtifactFilesSchema.parse(input.full);
  const selection = await selectNativeCompilerInputs({
    ...input,
    core: input.Core,
    check,
    runtimeProfile: input.runtime,
  });
  const origin = (file: { target: string; bytes: Uint8Array }, name: string) =>
    selectedCheckFile(file, name);
  const sources = selection.sources.map((file) => origin(file, file.name));
  const trustedTests = await Promise.all(
    selection.tests.map((f) => origin(f, f.name)),
  );
  const references = await projectReferences(selection, check);
  const chosen = (files: ArtifactFile[], patterns: string[]) =>
    files.filter((f) => patterns.some((p) => matchesGlob(f.target, p))).sort((
      a,
      b,
    ) => a.target.localeCompare(b.target));
  const publicFiles = chosen(student.files, check["verification-tests"] ?? []);
  if (
    publicFiles.some((f) =>
      f.reason !== "starter" &&
      !(f.reason.startsWith("testset:") &&
        input.studentPlan.testsets.includes(f.reason.slice(8))) &&
      !(f.reason.startsWith("component:") &&
        input.studentPlan.components.includes(f.reason.slice(10)))
    )
  ) throw Error("PL.SELECTION_INVALID: foreign public verification role");
  const verificationTests = await Promise.all(
    publicFiles.map((f) => origin(f, f.target)),
  );
  let verificationApiPrecheck;
  if (check["verification-api-precheck"]) {
    const selected = chosen(
      publicFiles,
      check["verification-api-precheck"].files,
    );
    if (!selected.length || selected.length >= publicFiles.length) {
      throw Error("PL.SELECTION_INVALID: verification API proper subset");
    }
    verificationApiPrecheck = {
      entry: check["verification-api-precheck"].entry,
      files: selected.map((f) => f.target),
    };
  }
  if (
    selection.descriptor.apiPrecheck && verificationTests.length &&
    !verificationApiPrecheck
  ) throw Error("PL.SELECTION_INVALID: public API required");
  const missing: string[] = [];
  if ((check["verification-tests"] ?? []).length && !verificationTests.length) {
    missing.push("verificationTests");
  }
  const trustedRole = (f: ArtifactFile) =>
    f.reason.startsWith("testset:")
      ? input.fullPlan.testsets.includes(f.reason.slice(8))
      : f.reason.startsWith("component:") &&
        input.fullPlan.components.includes(f.reason.slice(10));
  const target = (name: string) => {
    if (!safePath(name)) {
      throw Error("PL.SELECTION_INVALID: unsafe contract logical target");
    }
    const files = full.files.filter((f) => f.target === name);
    const file = files[0];
    if (files.length !== 1 || !file || !trustedRole(file)) {
      throw Error(
        "PL.SELECTION_MIGRATION_REQUIRED: contract target must be selected trusted A1 raw file: " +
          name,
      );
    }
    return file;
  };
  let contractCaseFile: SelectedCheckFile | undefined;
  let contractCases: (ArtifactFile & { name: string }) | undefined;
  const contractFixtures: SelectedCheckFile[] = [];
  if (check["contract-cases"]) {
    const name = check["contract-cases"], file = target(name);
    contractCaseFile = origin(file, name);
    contractCases = { ...file, name };
    contractFixtures.push(...contractFixtureFiles(file, target));
  }
  const project = {
    ...input.fact,
    check,
    qualifiedId: input.courseId + "/" + input.fact.exerciseId,
    sources,
    trustedTests,
    verificationTests,
    references,
    contractFixtures,
    readiness: { ready: missing.length === 0, missing },
    ...(selection.descriptor.apiPrecheck
      ? { apiPrecheck: selection.descriptor.apiPrecheck }
      : {}),
    ...(verificationApiPrecheck ? { verificationApiPrecheck } : {}),
    ...(contractCaseFile ? { contractCases: contractCaseFile } : {}),
  };
  return {
    project,
    selection: { ...selection, ...(contractCases ? { contractCases } : {}) },
  };
}
