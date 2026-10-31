import { createMetrics as __createMetrics } from "../observability/bridge.ts";
const __metrics = __createMetrics("course-prairielearn");
import { resolve } from "node:path";
import { canonical, hash, readSelected, safePath } from "./source-selection.ts";

/** Собственный private C inventory по уже выбранным bytes. Authority/currentness
 * остаются у живой Core composition; эта чистая функция их не создаёт.
 * inventoryHash не подставляется в legacy sourceSnapshotHash/inventoryHash.
 */
export async function nativeVerificationInventory(input: {
  courseId: string;
  operation: string;
  selections: Record<string, any>;
}) {
  if (
    !/^[a-z][a-z0-9-]*$/.test(input.courseId) ||
    !/^[a-f0-9-]{36}$/.test(input.operation)
  ) throw Error("PL.VERIFICATION_INVALID: identity");
  const questions = [],
    scenarios: { qualifiedId: string; scenario: string; optional: boolean }[] =
      [];
  const files = async (values: any[]) => {
    const result = [], names = new Set();
    if (!Array.isArray(values)) throw Error("PL.VERIFICATION_INVALID: files");
    for (const file of values) {
      if (
        !safePath(file.name) || names.has(file.name) ||
        !(file.bytes instanceof Uint8Array) ||
        await hash(file.bytes) !== file.sha256
      ) {
        throw Error("PL.VERIFICATION_CHANGED: selected bytes");
      }
      names.add(file.name);
      result.push({
        name: file.name,
        sha256: file.sha256,
        bytes: file.bytes.length,
      });
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  };
  for (
    const [id, selection] of Object.entries(input.selections).sort(([a], [b]) =>
      a.localeCompare(b)
    )
  ) {
    if (
      !/^exr-[a-z0-9-]+$/.test(id) || selection.provenance?.exerciseId !== id
    ) {
      throw Error("PL.VERIFICATION_INVALID: exercise binding");
    }
    const qualifiedId = input.courseId + "/" + id;
    scenarios.push({ qualifiedId, scenario: "starter", optional: false });
    const references = [], names = new Set();
    for (const reference of selection.references) {
      if (
        !reference.name || names.has(reference.name) ||
        typeof reference.optional !== "boolean"
      ) throw Error("PL.VERIFICATION_INVALID: reference");
      names.add(reference.name);
      references.push({
        name: reference.name,
        optional: reference.optional,
        files: await files(reference.files),
      });
      scenarios.push({
        qualifiedId,
        scenario: "reference:" + reference.name,
        optional: reference.optional,
      });
    }
    let contractCases;
    if (selection.contractCases) {
      const checked = await files([selection.contractCases]);
      const document = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(
          selection.contractCases.bytes,
        ),
      );
      if (document.schemaVersion !== 1 || !Array.isArray(document.cases)) {
        throw Error("PL.VERIFICATION_INVALID: cases");
      }
      const ids = new Set();
      for (const row of document.cases) {
        if (typeof row.id !== "string" || !row.id || ids.has(row.id)) {
          throw Error("PL.VERIFICATION_INVALID: repeated/missing case");
        }
        ids.add(row.id);
        scenarios.push({
          qualifiedId,
          scenario: "contract:" + row.id,
          optional: false,
        });
      }
      contractCases = checked[0];
    }
    questions.push({
      qualifiedId,
      sources: await files(selection.sources),
      tests: await files(selection.tests),
      references: references.sort((a, b) => a.name.localeCompare(b.name)),
      descriptor: structuredClone(selection.descriptor),
      provenance: structuredClone(selection.provenance),
      ...(contractCases ? { contractCases } : {}),
    });
  }
  const compare = (a: string, b: string) => {
    const x = Array.from(a), y = Array.from(b);
    for (let i = 0; i < Math.min(x.length, y.length); i++) {
      const d = x[i].codePointAt(0)! - y[i].codePointAt(0)!;
      if (d) return d;
    }
    return x.length - y.length;
  };
  scenarios.sort((a, b) =>
    compare(a.qualifiedId, b.qualifiedId) || compare(a.scenario, b.scenario)
  );
  const inventory = {
    schema: "pl-native-verification-inventory-v1",
    courseId: input.courseId,
    operation: input.operation,
    questions,
    scenarios,
  };
  return {
    ...inventory,
    inventoryHash: await hash(canonical(inventory)),
    scenariosHash: await hash(canonical(scenarios)),
  };
}
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

// @ts-expect-error JS допускает замену function binding; сигнатура публичного API сохраняется.
verificationInventoryHash = __metrics.wrapAsync({
  id:
    "course-prairielearn.application.verification-inventory.verificationInventoryHash",
  kind: "phase",
}, verificationInventoryHash);
