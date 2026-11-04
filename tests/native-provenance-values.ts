// Только public DTO/value controls: не operation/lease/A1/profile positive.
import type * as CorePublic from "course-core/public.ts";
import { pathToFileURL } from "node:url";
const Core: typeof CorePublic = await import(
  pathToFileURL(Deno.args[0] + "/_extensions/course-core/public.ts").href
);
import type { NativeOperationIdentity } from "course-core/public.ts";
import {
  nativeProjectWitness,
} from "../_extensions/course-prairielearn/application/native-provenance.ts";
const identity: NativeOperationIdentity = {
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
      target: "tests/File.java",
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
  witness.projects[0].materialization?.includeGit !== true ||
  "sourceSnapshotHash" in witness ||
  "inventoryHash" in witness
) throw Error("native scope/trace/materialization lost or aliased");
let controls = 0;
for (
  const mutate of [
    (p: typeof value) =>
      p.identity.operation = "33333333-3333-4333-8333-333333333333",
    (p: typeof value) => p.capturedInputs.pop(),
    (p: typeof value) => p.documents.pop(),
    (p: typeof value) => p.projects.pop(),
    (p: typeof value) => p.documents[1].projects = [],
    (p: typeof value) => p.projects[1].format = "html",
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
console.log(JSON.stringify(
  {
    status: "PUBLIC_DTO_ONLY_NOT_NATIVE_POSITIVE",
    controls,
    projects: 2,
    hiddenNonbankRetained: true,
    formats: ["html", "revealjs"],
  },
  null,
  2,
));
