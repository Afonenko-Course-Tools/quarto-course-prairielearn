import { matchesGlob } from "node:path";
import { NativeProjectCheckSchema } from "./native-checks.ts";
import { selectNativeCompilerInputs } from "./native-selection.ts";
import { nativeRawSourceSelection } from "./native-check-inventory.ts";
import { safePath } from "./source-selection.ts";
/** Только private projection непосредственно materialized A1 inventories.
 * Это не resolver/reader; все paths/data получены от public Core той же операции.
 */
export async function projectNativeChecks(
  input: {
    Core: any;
    fact: any;
    sourceRows: any[];
    student: any;
    full: any;
    studentPlan: any;
    fullPlan: any;
    runtime: any;
    courseId: string;
  },
) {
  const check = NativeProjectCheckSchema.parse(input.fact.check),
    student = input.Core.ArtifactInventorySchema.parse(input.student),
    full = input.Core.ArtifactInventorySchema.parse(input.full);
  const selection = await selectNativeCompilerInputs({
    ...input,
    core: input.Core,
    check,
    runtimeProfile: input.runtime,
  });
  const origin = (f: any, name: string) =>
    nativeRawSourceSelection({
      Core: input.Core,
      file: {
        target: f.target,
        rawSource: f.rawSource,
        bytes: f.bytes,
        sha256: f.sha256,
        size: f.size,
        audience: f.audience ?? "full",
        reason: f.reason,
      },
      projectRoot: input.fact.projectRoot,
      submissionRelativePath: name,
      sourceRows: input.sourceRows,
      version: 2,
    });
  const sources = await Promise.all(
    selection.sources.map((f) => origin({ ...f, audience: "student" }, f.name)),
  );
  // Public delivery3 не умеет owner-relative student binding.
  if (sources.some((s) => "ownerRelativePath" in s)) {
    throw Error(
      "PL.NATIVE_PUBLIC_ORIGIN_UNSUPPORTED: external student source requires public contract revision",
    );
  }
  const trustedTests = await Promise.all(
    selection.tests.map((f) => origin(f, f.name)),
  );
  const primary = new Set(selection.sources.map((f) => f.name));
  const extras = check["additional-java-sources"];
  const references = [];
  for (const ref of selection.references) {
    const names = new Set(ref.files.map((f) => f.name));
    if (
      ref.available &&
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
  const chosen = (files: any[], patterns: string[]) =>
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
  const trustedRole = (f: any) =>
    f.reason.startsWith("testset:")
      ? input.fullPlan.testsets.includes(f.reason.slice(8))
      : f.reason.startsWith("component:") &&
        input.fullPlan.components.includes(f.reason.slice(10));
  const target = (name: string) => {
    if (!safePath(name)) {
      throw Error("PL.SELECTION_INVALID: unsafe contract logical target");
    }
    const files = full.files.filter((f: any) => f.target === name);
    if (files.length !== 1 || !trustedRole(files[0])) {
      throw Error(
        "PL.SELECTION_MIGRATION_REQUIRED: contract target must be selected trusted A1 raw file: " +
          name,
      );
    }
    return files[0];
  };
  let contractCasesHash, contractCases;
  const contractFixtures: any[] = [];
  if (check["contract-cases"]) {
    const name = check["contract-cases"], file = target(name);
    const selected = await origin(file, name);
    const { submissionRelativePath: _ignored, ...hashRecord } = selected;
    contractCasesHash = { ...hashRecord, logicalTarget: name };
    contractCases = { ...file, name };
    const doc = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(file.bytes),
    );
    if (doc.schemaVersion !== 1 || !Array.isArray(doc.cases)) {
      throw Error("PL.VERIFICATION_INVALID: contract cases");
    }
    const ids = new Set<string>();
    for (const row of doc.cases) {
      if (typeof row.id !== "string" || !row.id || ids.has(row.id)) {
        throw Error("PL.VERIFICATION_INVALID: case id");
      }
      ids.add(row.id);
      for (const item of row.sources ?? []) {
        if (
          !safePath(item.fixture) ||
          !item.fixture.startsWith("tests/fixtures/") ||
          !safePath(item.submission)
        ) throw Error("PL.VERIFICATION_INVALID: fixture mapping");
        const file = target(item.fixture);
        contractFixtures.push({
          ...await origin(file, item.submission),
          logicalTarget: item.fixture,
        });
      }
    }
  }
  const project = {
    ...input.fact,
    qualifiedId: input.courseId + "/" + input.fact.exerciseId,
    selectionOriginVersion: 2,
    nativePlanGroups: [...input.fullPlan.groups],
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
    ...(contractCasesHash ? { contractCasesHash } : {}),
  };
  return {
    project,
    selection: { ...selection, ...(contractCases ? { contractCases } : {}) },
  };
}
