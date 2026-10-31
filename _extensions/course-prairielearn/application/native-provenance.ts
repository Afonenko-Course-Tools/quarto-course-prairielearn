import { isDeepStrictEqual } from "node:util";
import { canonical, hash, safePath } from "./source-selection.ts";
/** Чистая C-проекция public DTO. Не создаёт operation/A1 authority, не читает S. */
export async function nativeProjectWitness(
  Core: any,
  value: unknown,
  expected: { identity: unknown; sources: readonly string[] },
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
    !coverage(p.documents.map((d: any) => d.source))
  ) throw Error("PL.PROVENANCE_CHANGED: owner/captured identity");
  const rows = new Map<string, string>();
  for (const row of p.sourceRows) {
    if (!safePath(row.source) || rows.has(row.source)) {
      throw Error("PL.PROVENANCE_CHANGED: source row");
    }
    rows.set(row.source, row.sha256);
  }
  if (expected.sources.some((s) => !rows.has(s))) {
    throw Error("PL.PROVENANCE_CHANGED: authored source binding");
  }
  const keys = new Set<string>(), projects: any[] = [];
  for (const doc of p.documents) {
    for (const fact of doc.projects) {
      const key = doc.source + "\0" + fact.exerciseId;
      const declared = p.projects.filter((row: any) =>
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
        sourceSha256: rows.get(doc.source),
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
  const witness = {
    schema: "pl-native-project-witness-v1",
    identity: p.identity,
    ownerInputs: p.ownerInputs,
    capturedInputs: p.capturedInputs,
    sourceRows: p.sourceRows,
    projects,
  };
  return {
    ...witness,
    nativeProjectWitnessHash: await hash(canonical(witness)),
  };
}
/** Старые v3 hash names не принимают native witness другой области. */
export function requireNativeChecksContract(): never {
  throw Error(
    "PL.NATIVE_CHECKS_CONTRACT_UNQUALIFIED: strict v3 requires physical-source selection parity or an explicitly accepted native contract revision; publish refused",
  );
}
