import { required } from "./fixture-values.ts";
// Только public DTO/value controls: не operation/lease/A1/profile positive.
import type {
  NativeAssignmentProvenance,
  NativeProjectFact,
} from "course-core/public.ts";
import { nativeProjectRows } from "../_extensions/course-prairielearn/application/native-provenance.ts";
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
  documents: [{
    source: a.source,
    format: "html",
    projects: [a],
  }, {
    source: b.source,
    format: "revealjs",
    projects: [b],
  }],
};
const rows = nativeProjectRows(value);
if (
  rows.length !== 2 || required(rows[1]).fact.bankMember ||
  required(rows[1]).format !== "revealjs" ||
  required(rows[0]).materialization?.includeGit !== true
) throw Error("typed hidden/nonbank/format/materialization projection lost");
// Изменение normalized PL policy не должно менять captured Core facts.
required(required(required(rows[0]).materialization).commonFiles[0]).target = "tests/Changed.java";
if (
  required(required(required(required(value.documents[0]).projects[0]).materialization).commonFiles[0]).target !==
    "tests/File.java"
) {
  throw Error("PL projection aliases typed Core materialization");
}
let controls = 0;
for (
  const path of ["../private", "/outside", "C:/outside", "a\\b", "a/../b", ""]
) {
  const bad = structuredClone(value);
  required(required(bad.documents[1]).projects[0]).projectRoot = path;
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
