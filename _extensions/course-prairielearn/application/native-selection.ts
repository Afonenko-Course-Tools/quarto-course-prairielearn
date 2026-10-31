import { matchesGlob } from "node:path";
import { NativeProjectCheckSchema } from "./native-checks.ts";
import { hash, safePath } from "./source-selection.ts";
import { runtimeDescriptor } from "./runtime-descriptor.ts";

type File = {
  target: string;
  rawSource?: string;
  bytes: Uint8Array;
  sha256: string;
  reason: string;
  size: number;
};
type CoreBoundary = {
  ArtifactInventorySchema: { parse: (value: unknown) => any };
  ProjectPlanSchema: { parse: (value: unknown) => any };
};
/** Pure consumer of actual checked A1 plan inventories. It never discovers files
 * or interprets metadata. Authored roots/globs keep their exact target meaning.
 */
export async function selectNativeCompilerInputs(options: {
  core: CoreBoundary;
  check: unknown;
  runtimeProfile: any;
  studentPlan: unknown;
  fullPlan: unknown;
  student: unknown;
  full: unknown;
}) {
  const check = NativeProjectCheckSchema.parse(options.check);
  const student = options.core.ArtifactInventorySchema.parse(options.student),
    full = options.core.ArtifactInventorySchema.parse(options.full);
  const studentPlan = options.core.ProjectPlanSchema.parse(options.studentPlan),
    fullPlan = options.core.ProjectPlanSchema.parse(options.fullPlan);
  if (
    student.audience !== "student" || full.audience !== "full" ||
    studentPlan.audience !== "student" || fullPlan.audience !== "full" ||
    student.operation !== full.operation ||
    student.exerciseId !== full.exerciseId ||
    studentPlan.input !== fullPlan.input
  ) throw Error("PL.SELECTION_INVALID: inventories/plan identity mismatch");
  const file = async (value: File, name: string) => {
    if (
      !safePath(name) || value.size !== value.bytes.length ||
      await hash(value.bytes) !== value.sha256
    ) {
      throw Error("PL.SELECTION_CHANGED: inventory bytes");
    }
    const bytes = new Uint8Array(value.bytes);
    return {
      name,
      bytes,
      sha256: value.sha256,
      size: value.size,
      target: value.target,
      reason: value.reason,
      ...(value.rawSource === undefined ? {} : { rawSource: value.rawSource }),
    };
  };
  const under = (target: string, root: string) =>
    target.startsWith(root + "/") ? target.slice(root.length + 1) : undefined;
  function select(
    files: File[],
    root: string,
    patterns: string[],
    role: (file: File) => boolean,
    label: string,
  ) {
    if (!safePath(root) || /[*?\[\]{}]/.test(root) || !patterns.length) {
      throw Error(
        "PL.SELECTION_INVALID: explicit " + label + " root/include required",
      );
    }
    const chosen = new Map<string, File>();
    for (const pattern of patterns) {
      if (!safePath(pattern)) throw Error("PL.SELECTION_INVALID: unsafe glob");
      const matches = files.filter((f) => {
        const path = under(f.target, root);
        return path !== undefined && matchesGlob(path, pattern);
      });
      if (!matches.length) {
        throw Error(
          "PL.SELECTION_MIGRATION_REQUIRED: no A1 target for " + label + " " +
            root + "/" + pattern,
        );
      }
      for (const f of matches) {
        if (!role(f)) {
          throw Error("PL.SELECTION_INVALID: foreign planned role " + f.reason);
        }
        chosen.set(f.target, f);
      }
    }
    return [...chosen.values()].sort((a, b) =>
      a.target.localeCompare(b.target)
    );
  }
  const sourceRecords = select(
    student.files,
    check.sourceProfile.root,
    check.sourceProfile.include,
    (f) => f.reason === "starter",
    "source",
  );
  const sources = await Promise.all(
    sourceRecords.map((f) =>
      file(f, under(f.target, check.sourceProfile.root)!)
    ),
  );
  const extensions = options.runtimeProfile?.sourceExtensions ?? [".java"];
  if (
    !Array.isArray(extensions) || !extensions.length ||
    options.runtimeProfile?.javaRelease !== undefined &&
      extensions.some((e: string) => e !== ".java") ||
    extensions.some((e: any) =>
      typeof e !== "string" || !/^\.[a-z][a-z0-9]*$/.test(e)
    )
  ) throw Error("PL.SELECTION_INVALID: runtime extensions");
  function validateSources(files: typeof sources) {
    if (
      !files.length || files.length > 128 ||
      files.reduce((n, f) => n + f.bytes.length, 0) > 4194304
    ) {
      throw Error("PL.SELECTION_INVALID: source count/total bytes");
    }
    for (const source of files) {
      if (
        !extensions.some((e: string) => source.name.endsWith(e)) ||
        source.bytes.length > 1048576
      ) throw Error("PL.SELECTION_INVALID: non-source student target");
      const text = new TextDecoder("utf-8", { fatal: true }).decode(
        source.bytes,
      );
      if (text.includes("\0")) throw Error("PL.SELECTION_INVALID: NUL source");
    }
  }
  validateSources(sources);
  function trustedRole(f: File) {
    return f.reason.startsWith("testset:")
      ? fullPlan.testsets.includes(f.reason.slice(8))
      : f.reason.startsWith("component:") &&
        fullPlan.components.includes(f.reason.slice(10));
  }
  const trustedRecords = new Map<string, File>();
  for (const pattern of check.tests) {
    const selected = (full.files as File[]).filter((f) =>
      matchesGlob(f.target, pattern)
    );
    if (!selected.length) {
      throw Error(
        "PL.SELECTION_MIGRATION_REQUIRED: no A1 target for tests " + pattern,
      );
    }
    for (const f of selected) {
      if (!trustedRole(f)) {
        throw Error(
          "PL.SELECTION_INVALID: trusted selector reaches " + f.reason,
        );
      }
      trustedRecords.set(f.target, f);
    }
  }
  if (!trustedRecords.size) {
    throw Error("PL.SELECTION_INVALID: trusted tests missing");
  }
  const tests = await Promise.all(
    [...trustedRecords.values()].sort((a, b) =>
      a.target.localeCompare(b.target)
    ).map((f) => file(f, f.target)),
  );
  let api: undefined | { files: string[]; entry: string };
  if (check["api-precheck"]) {
    const names = new Set<string>();
    for (const pattern of check["api-precheck"].files) {
      const chosen = tests.filter((f) => matchesGlob(f.name, pattern));
      if (!chosen.length) {
        throw Error("PL.SELECTION_INVALID: empty API selector");
      }
      for (const f of chosen) names.add(f.name);
    }
    if (names.size >= tests.length) {
      throw Error("PL.SELECTION_INVALID: API must be a proper trusted subset");
    }
    api = { files: [...names].sort(), entry: check["api-precheck"].entry };
  }
  const references = [];
  for (const ref of check.references ?? []) {
    const group = /^author\/([^/]+)\//.exec(ref.root)?.[1];
    if (!group) {
      throw Error(
        "PL.SELECTION_INVALID: reference requires explicit A1 author/group target root",
      );
    }
    if (!fullPlan.groups.includes(group)) {
      if (!ref.optional) {
        throw Error(
          "PL.SELECTION_INVALID: missing required reference group " + group,
        );
      }
      references.push({
        ...ref,
        group,
        available: false,
        targets: [],
        files: [],
      });
      continue;
    }
    const records = select(
      full.files,
      ref.root,
      check.sourceProfile.include,
      (f) =>
        f.reason.startsWith("solution:") &&
        fullPlan.groups.includes(f.reason.slice(9)),
      "reference:" + ref.name,
    );
    const files = await Promise.all(
      records.map((f) => file(f, under(f.target, ref.root)!)),
    );
    // Вспомогательные классы эталона принадлежат той же проверенной A1 solution group.
    validateSources(files);
    references.push({
      ...ref,
      group,
      available: true,
      targets: records.map((f) => f.target),
      files,
    });
  }
  const descriptor = runtimeDescriptor(
    check,
    options.runtimeProfile,
    sources.map((f) => f.name),
    tests.map((f) => f.name),
    api,
  );
  return {
    sources,
    tests,
    references,
    descriptor,
    provenance: {
      studentOperation: student.operation,
      exerciseId: student.exerciseId,
      studentPlan: studentPlan.id,
      fullPlan: fullPlan.id,
      testsets: fullPlan.testsets,
      components: fullPlan.components,
      groups: fullPlan.groups,
    },
  };
}
