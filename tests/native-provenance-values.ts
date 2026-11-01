// Только public DTO/value controls: не operation/lease/A1/profile positive.
import { pathToFileURL } from "node:url";
import {
  nativeProjectWitness,
  requireNativeChecksContract,
} from "../_extensions/course-prairielearn/application/native-provenance.ts";
const Core = await import(
  pathToFileURL(Deno.args[0] + "/_extensions/course-core/public.ts").href
);
const identity = {
  operation: "22222222-2222-4222-8222-222222222222",
  profiles: ["full"],
  projection: "author",
  runtime: "quarto-1.11.5",
};
const inputs = ["work.qmd", "hidden.qmd"];
const fact = (source: string, id: string, bankMember: boolean) => ({
  exerciseId: id,
  source,
  projectRoot: "projects/" + id,
  bankMember,
  statementVisibility: bankMember ? "open" : "restricted",
  artifactPolicy: { full: "full", conditions: true },
  materialization: {
    commonFiles: [{
      source: "shared/File.java",
      target: "src/File.java",
      audience: "grading",
    }],
    includeGit: true,
  },
});
const a = fact("work.qmd", "exr-visible", true),
  b = fact("hidden.qmd", "exr-hidden", false);
const value = {
  schema: "course-native-assignment-provenance-v1",
  identity,
  ownerInputs: inputs,
  capturedInputs: inputs,
  sourceRows: [
    ...inputs.map((source) => ({ source, sha256: "a".repeat(64) })),
    { source: "shared/File.java", sha256: "b".repeat(64) },
  ],
  projects: [{
    source: a.source,
    id: a.exerciseId,
    project: "/" + a.projectRoot,
    format: "html",
  }, {
    source: b.source,
    id: b.exerciseId,
    project: "/" + b.projectRoot,
    format: "revealjs",
  }],
  documents: [{
    source: a.source,
    format: "html",
    projects: [a],
    projectMaterializations: { [a.exerciseId]: a.materialization },
  }, {
    source: b.source,
    format: "revealjs",
    projects: [b],
    projectMaterializations: { [b.exerciseId]: b.materialization },
  }],
};
const expected = { identity, sources: inputs };
const witness = await nativeProjectWitness(Core, value, expected);
if (
  witness.projects.length !== 2 || witness.projects[1].fact.bankMember ||
  witness.projects[1].format !== "revealjs" ||
  witness.projects[0].materialization.includeGit !== true ||
  witness.sourceRows.length !== 3 || "sourceSnapshotHash" in witness ||
  "inventoryHash" in witness
) throw Error("native scope/trace/materialization lost or aliased");
let controls = 0;
for (
  const mutate of [
    (p: any) => p.identity.operation = "33333333-3333-4333-8333-333333333333",
    (p: any) => p.capturedInputs.pop(),
    (p: any) => p.documents.pop(),
    (p: any) => p.sourceRows.shift(),
    (p: any) => p.projects.pop(),
    (p: any) => p.documents[1].projects = [],
    (p: any) => p.projects[1].format = "html",
    (p: any) => p.sourceRows.push(p.sourceRows[0]),
  ]
) {
  const bad = structuredClone(value);
  mutate(bad);
  let refused = false;
  try {
    await nativeProjectWitness(Core, bad, expected);
  } catch {
    refused = true;
  }
  if (!refused) throw Error("invalid public DTO accepted");
  controls++;
}
const changed = structuredClone(value);
changed.sourceRows[2].sha256 = "c".repeat(64);
if (
  (await nativeProjectWitness(Core, changed, expected))
    .nativeProjectWitnessHash === witness.nativeProjectWitnessHash
) throw Error("same-S trace not committed");
let closed = false;
try {
  requireNativeChecksContract();
} catch (error) {
  closed = String(error).includes("PL.NATIVE_CHECKS_CONTRACT_UNQUALIFIED");
}
if (!closed) throw Error("strict v3 barrier opened");
console.log(JSON.stringify(
  {
    status: "PUBLIC_DTO_ONLY_NOT_NATIVE_POSITIVE",
    controls,
    projects: 2,
    hiddenNonbankRetained: true,
    formats: ["html", "revealjs"],
    sameSTraceCommitted: true,
    strictV3Refused: true,
  },
  null,
  2,
));
