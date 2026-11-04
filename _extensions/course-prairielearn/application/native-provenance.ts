import type * as CorePublic from "course-core/public.ts";
import type {
  NativeAssignmentProvenance,
  NativeOperationIdentity,
  NativeProjectFact,
} from "course-core/public.ts";
import type { NativeProjectCheck } from "./native-checks.ts";
import { decodeNativeCheck } from "./native-checks.ts";
import { isDeepStrictEqual } from "node:util";
import { safePath } from "./source-selection.ts";
/** PL policy принадлежит C. Core передаёт selector и raw plane из той же
 * preprojection capture, включая скрытые/non-PL проекты. Никакого IO/authority. */
export function normalizeNativeProjectFact(
  value: NativeProjectFact,
  projectChecks: unknown,
): Omit<NativeProjectFact, "check" | "projectCheck"> & {
  check?: NativeProjectCheck;
} {
  const { projectCheck, check: legacyCheck, ...fact } = structuredClone(value);
  if (projectCheck === undefined) {
    if (legacyCheck !== undefined) {
      throw Error(
        "PL.CHECKS_CHANGED: normalized check without authentic selector",
      );
    }
    return fact;
  }
  if (typeof projectCheck !== "string" || !projectCheck) {
    throw Error("PL.CHECKS_CHANGED: invalid check selector");
  }
  const check = decodeNativeCheck(projectChecks, projectCheck);
  if (legacyCheck !== undefined && !isDeepStrictEqual(legacyCheck, check)) {
    throw Error("PL.CHECKS_CHANGED: selector/plane normalized policy mismatch");
  }
  return { ...fact, check };
}
/** Чистая C-проекция public DTO. Не создаёт operation/A1 authority, не читает S. */
export async function nativeProjectWitness(
  Core: Pick<typeof CorePublic, "NativeAssignmentProvenanceSchema">,
  value: unknown,
  expected: { identity: NativeOperationIdentity; sources: readonly string[] },
) {
  const p = Core.NativeAssignmentProvenanceSchema.parse(value);
  const unique = (xs: string[]) => new Set(xs).size === xs.length;
  const coverage = (xs: string[]) =>
    unique(xs) && xs.length === expected.sources.length &&
    xs.every((s) => expected.sources.includes(s));
  if (
    !isDeepStrictEqual(p.identity, expected.identity) ||
    !unique([...expected.sources]) || !coverage(p.ownerInputs) ||
    !coverage(p.capturedInputs) ||
    !coverage(p.documents.map((d) => d.source))
  ) throw Error("PL.PROVENANCE_CHANGED: owner/captured identity");
  const keys = new Set<string>(),
    projects: {
      source: string;
      format: NativeAssignmentProvenance["documents"][number]["format"];
      declaration: NativeAssignmentProvenance["projects"][number];
      fact: ReturnType<typeof normalizeNativeProjectFact>;
      materialization: NativeProjectFact["materialization"];
    }[] = [];
  for (const doc of p.documents) {
    for (const generic of doc.projects) {
      const fact = normalizeNativeProjectFact(generic, doc.projectChecks);
      const key = doc.source + "\0" + fact.exerciseId;
      const declared = p.projects.filter((row) =>
        row.source === doc.source && row.id === fact.exerciseId
      );
      if (
        keys.has(key) || fact.source !== doc.source ||
        !safePath(fact.projectRoot) || declared.length !== 1 ||
        declared[0].project !== "/" + fact.projectRoot ||
        declared[0].format !== doc.format
      ) {
        throw Error(
          "PL.PROVENANCE_CHANGED: complete project declaration parity",
        );
      }
      keys.add(key);
      projects.push({
        source: doc.source,
        format: doc.format,
        declaration: declared[0],
        fact,
        materialization: doc.projectMaterializations[fact.exerciseId] ??
          fact.materialization,
      });
    }
  }
  if (keys.size !== p.projects.length) {
    throw Error("PL.PROVENANCE_CHANGED: omitted hidden/nonbank project");
  }
  return {
    identity: p.identity,
    ownerInputs: p.ownerInputs,
    capturedInputs: p.capturedInputs,
    projects,
  };
}
