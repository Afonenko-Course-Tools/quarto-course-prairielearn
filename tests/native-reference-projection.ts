import { required } from "./fixture-values.ts";
import type * as CorePublic from "course-core/public.ts";
import { pathToFileURL } from "node:url";
const Core: typeof CorePublic = await import(
  pathToFileURL(Deno.args[0] + "/_extensions/course-core/public.ts").href
);
import type {
  ArtifactFile,
  ArtifactFiles,
  ProjectPlan,
} from "course-core/public.ts";
import { projectNativeChecks } from "../_extensions/course-prairielearn/application/native-check-projection.ts";
const assert = (v: unknown, m: string) => {
  if (!v) throw Error(m);
};
const plan = (audience: "student" | "full"): ProjectPlan => ({
  id: crypto.randomUUID(),
  input: "projects/example",
  audience,
  testsets: ["checks"],
  components: [],
  groups: ["alternate"],
});
async function file(
  target: string,
  reason: string,
  audience: ArtifactFile["audience"],
) {
  const bytes = new TextEncoder().encode(
    "class " + target.split("/").at(-1)!.replace(".java", "") + " {}\n",
  );
  return {
    target,
    reason,
    audience,
    bytes,
  };
}
const student: ArtifactFiles = {
  exerciseId: "exr-example",
  audience: "student",
  files: [await file("src/Study.java", "starter", "student")],
};
const full: ArtifactFiles = {
  ...student,
  audience: "full",
  files: [
    await file("src/Study.java", "starter", "full"),
    await file("tests/Checks.java", "testset:checks", "full"),
    await file(
      "author/alternate/src/Helper.java",
      "solution:alternate",
      "full",
    ),
    await file(
      "author/alternate/src/Replacement.java",
      "solution:alternate",
      "full",
    ),
  ],
};
const input: Parameters<typeof projectNativeChecks>[0] = {
  Core,
  fact: {
    source: "bank.qmd",
    exerciseId: "exr-example",
    projectRoot: "projects/example",
    bankMember: true,
    statementVisibility: "open",
    artifactPolicy: { full: "full", conditions: true },
    check: {
      profile: "example",
      runtime: "java25-junit-v1",
      "source-profile": "main",
      sourceProfile: {
        mode: "implementation",
        root: "src",
        include: ["**/*.java"],
      },
      tests: ["tests/*.java"],
      scoring: { mode: "weighted" },
      references: [{
        name: "alternate",
        root: "author/alternate/src",
        optional: false,
      }],
    },
  },
  student,
  full,
  studentPlan: plan("student"),
  fullPlan: plan("full"),
  runtime: {
    mode: "implementation",
    javaRelease: 25,
    sourceExtensions: [".java"],
  },
  courseId: "fixture",
};
const before = JSON.stringify(student);
const positive = await projectNativeChecks(input);
assert(
  required(positive.project.references[0]).sources.map((f) => f.name).join(",") ===
    "Helper.java,Replacement.java",
  "Полное решение потеряло helper/replacement",
);
assert(
  JSON.stringify(student) === before &&
    positive.selection.descriptor.sourceFiles.join(",") === "Study.java",
  "Student descriptor изменён",
);
const rejected: string[] = [];
for (
  const [name, mutate] of [
    ["role", (v: typeof input) => required(required(v.full).files[2]).reason = "starter"],
    ["bytes", (v: typeof input) => required(required(v.full).files[2]).bytes[0] = 0],
    ["missing-group", (v: typeof input) => v.fullPlan.groups = []],
    [
      "configured-primary",
      (v: typeof input) =>
        v.fact.check!["additional-java-sources"] = {
          archive: "extra.zip",
          "max-files": 8,
          "max-file-bytes": 1024,
          "max-total-bytes": 8192,
          "max-archive-bytes": 8192,
        },
    ],
  ] as const
) {
  const { Core: core, ...copy } = input;
  const v = { ...structuredClone(copy), Core: core };
  mutate(v);
  let error = "";
  try {
    await projectNativeChecks(v);
  } catch (e) {
    error = String(e);
  }
  assert(error.includes("PL.SELECTION_"), name + " accepted " + error);
  rejected.push(name);
}
console.log(
  JSON.stringify({
    status: "PASS_PURE_PROJECTION_NOT_OPERATION_AUTHORITY",
    referenceFiles: required(positive.project.references[0]).sources,
    studentUnchanged: true,
    rejected,
  }),
);
