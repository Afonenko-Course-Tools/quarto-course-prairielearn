// Только public DTO/value controls: не operation/lease/A1/profile positive.
import type {
  NativeAssignmentProvenance,
  NativeOperationIdentity,
  NativeProjectFact,
} from "course-core/public.ts";
import { nativeProjectRows } from "../_extensions/course-prairielearn/application/native-provenance.ts";
const identity: NativeOperationIdentity = {
  operation: "22222222-2222-4222-8222-222222222222",
  profiles: ["full"],
  projection: "author",
  runtime: "quarto-1.11.5",
};
const inputs = ["work.qmd", "hidden.qmd"];
const fact = (
  source: string,
  id: string,
  bankMember: boolean,
): NativeProjectFact => ({
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
const value: NativeAssignmentProvenance = {
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
    projectMaterializations: {},
  }, {
    source: b.source,
    format: "revealjs",
    projects: [b],
    projectMaterializations: {},
  }],
};
const rows = nativeProjectRows(value);
if (
  rows.length !== 2 || rows[1].fact.bankMember ||
  rows[1].format !== "revealjs" ||
  rows[0].materialization?.includeGit !== true
) throw Error("typed hidden/nonbank/format/materialization projection lost");
// Изменение normalized PL policy не должно менять captured Core facts.
rows[0].materialization!.commonFiles[0].target = "tests/Changed.java";
if (
  value.documents[0].projects[0].materialization!.commonFiles[0].target !==
    "tests/File.java"
) {
  throw Error("PL projection aliases typed Core materialization");
}
let controls = 0;
for (
  const path of ["../private", "/outside", "C:/outside", "a\\b", "a/../b", ""]
) {
  const bad = structuredClone(value);
  bad.documents[1].projects[0].projectRoot = path;
  let refused = false;
  try {
    nativeProjectRows(bad);
  } catch (error) {
    refused = String(error).includes("PL.PROJECT_INVALID");
  }
  if (!refused) throw Error("unsafe typed project path accepted");
  controls++;
}
console.log(JSON.stringify({
  status: "TYPED_PROJECTION_ONLY_NOT_NATIVE_POSITIVE",
  controls,
  projects: rows.length,
  hiddenNonbankRetained: true,
  formats: rows.map((row) => row.format),
  inputIsolation: true,
}));
