import { pathToFileURL } from "node:url";
import { projectNativeChecks } from "../_extensions/course-prairielearn/application/native-check-projection.ts";
import { hash } from "../_extensions/course-prairielearn/application/source-selection.ts";
const Core = await import(
  pathToFileURL(Deno.args[0] + "/_extensions/course-core/public.ts").href
);
const assert = (v: unknown, m: string) => {
  if (!v) throw Error(m);
};
const operation = crypto.randomUUID();
const plan = (audience: string) => ({
  id: crypto.randomUUID(),
  input: "projects/example",
  audience,
  testsets: ["checks"],
  components: [],
  groups: ["alternate"],
});
async function file(target: string, reason: string, audience: string) {
  const bytes = new TextEncoder().encode(
    "class " + target.split("/").at(-1)!.replace(".java", "") + " {}\n",
  );
  return {
    target,
    rawSource: "projects/example/" + audience + "/" + target,
    reason,
    audience,
    bytes,
    size: bytes.length,
    sha256: await hash(bytes),
  };
}
const student = {
  schema: "course-artifact-inventory-v1",
  operation,
  exerciseId: "exr-example",
  audience: "student",
  files: [await file("src/Study.java", "starter", "student")],
};
const full = {
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
const input: any = {
  Core,
  fact: {
    source: "bank.qmd",
    exerciseId: "exr-example",
    projectRoot: "projects/example",
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
  sourceRows: [...student.files, ...full.files].map((f) => ({
    source: f.rawSource,
    sha256: f.sha256,
  })),
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
  positive.project.references[0].sources.map((f: any) =>
    f.submissionRelativePath
  ).join(",") === "Helper.java,Replacement.java",
  "Полное решение потеряло helper/replacement",
);
assert(
  positive.project.references[0].sources.every((r: any) =>
    input.sourceRows.some((s: any) => s.sha256 === r.sha256)
  ),
  "Hash не связан с exact raw rows",
);
assert(
  JSON.stringify(student) === before &&
    positive.selection.descriptor.sourceFiles.join(",") === "Study.java",
  "Student descriptor изменён",
);
const rejected: string[] = [];
for (
  const [name, mutate] of [
    ["role", (v: any) => v.full.files[2].reason = "starter"],
    ["bytes", (v: any) => v.full.files[2].bytes[0] = 0],
    ["missing-group", (v: any) => v.fullPlan.groups = []],
    [
      "configured-primary",
      (v: any) =>
        v.fact.check["additional-java-sources"] = {
          archive: "extra.zip",
          "max-files": 8,
          "max-file-bytes": 1024,
          "max-total-bytes": 8192,
          "max-archive-bytes": 8192,
        },
    ],
  ] as const
) {
  const v = structuredClone({ ...input, Core: undefined });
  v.Core = Core;
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
    referenceFiles: positive.project.references[0].sources,
    studentUnchanged: true,
    rejected,
  }),
);
