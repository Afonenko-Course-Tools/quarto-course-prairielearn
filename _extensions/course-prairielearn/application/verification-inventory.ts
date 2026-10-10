import { resolve } from "node:path";
import { canonical, hash, readSelected, safePath } from "./source-selection.ts";
/** Public hash only; private references, fixtures and expectation documents remain outside native output. */
export async function verificationInventoryHash(
  checks: any,
  bookRoot: string,
  qualifiedIds: string[],
) {
  const records: {
    qualifiedId: string;
    scenario: string;
    optional: boolean;
  }[] = [];
  for (const qualifiedId of [...qualifiedIds].sort()) {
    const project = checks.projects.find((p: any) =>
      p.qualifiedId === qualifiedId ||
      (checks.courseId + "/" + p.exerciseId) === qualifiedId
    );
    if (!project || !safePath(project.projectRoot)) {
      throw new Error("PL verification project missing");
    }
    records.push({ qualifiedId, scenario: "starter", optional: false });
    for (
      const reference of project.references ?? project.check.references ?? []
    ) {
      records.push({
        qualifiedId,
        scenario: "reference:" + reference.name,
        optional: reference.optional === true,
      });
    }
    const casesHash = project.contractCasesHash ?? project.contractCases;
    if (casesHash) {
      const bytes = await readSelected(resolve(bookRoot, project.projectRoot), {
        ...casesHash,
        submissionRelativePath: casesHash.projectRelativePath,
      });
      const doc = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      );
      if (doc.schemaVersion !== 1 || !Array.isArray(doc.cases)) {
        throw new Error("PL contract cases invalid");
      }
      for (const c of doc.cases) {
        if (typeof c.id !== "string" || !c.id) {
          throw new Error("PL contract case id missing");
        }
        records.push({
          qualifiedId,
          scenario: "contract:" + c.id,
          optional: false,
        });
      }
    }
  }
  const compare = (a: string, b: string) => {
    const x = Array.from(a), y = Array.from(b);
    for (let i = 0; i < Math.min(x.length, y.length); i++) {
      const d = x[i].codePointAt(0)! - y[i].codePointAt(0)!;
      if (d) return d;
    }
    return x.length - y.length;
  };
  records.sort((a, b) =>
    compare(a.qualifiedId, b.qualifiedId) || compare(a.scenario, b.scenario)
  );
  if (
    new Set(records.map((r) => r.qualifiedId + "\0" + r.scenario)).size !==
      records.length
  ) throw new Error("PL duplicate verification scenario");
  return await hash(canonical(records));
}
