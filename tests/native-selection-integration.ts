import { pathToFileURL } from "node:url";
import { selectNativeCompilerInputs } from "../_extensions/course-prairielearn/public.ts";
import { hash } from "../_extensions/course-prairielearn/application/source-selection.ts";
const Core = await import(
  pathToFileURL(Deno.args[0] + "/_extensions/course-core/public.ts").href
);
const operation = crypto.randomUUID(), input = "projects/example";
const plan = (audience: string) => ({
  id: crypto.randomUUID(),
  input,
  audience,
  testsets: ["checks"],
  components: ["api"],
  groups: ["alternate"],
});
async function file(
  target: string,
  reason: string,
  audience: string,
  text = "class Example {}",
) {
  const bytes = new TextEncoder().encode(text);
  return {
    target,
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
  files: [await file("src/main/java/Study.java", "starter", "student")],
};
const full = {
  ...student,
  audience: "full",
  files: [
    await file("src/main/java/Study.java", "starter", "full"),
    await file("src/api/java/Api.java", "component:api", "full"),
    await file("src/test/java/Checks.java", "testset:checks", "full"),
    await file(
      "author/alternate/src/main/java/Study.java",
      "solution:alternate",
      "full",
    ),
    await file(
      "author/alternate/src/main/java/Example.java",
      "solution:alternate",
      "full",
    ),
  ],
};
const check = {
  profile: "example",
  runtime: "java25-gradle-junit-v1",
  "source-profile": "main",
  sourceProfile: {
    mode: "implementation",
    root: "src/main/java",
    include: ["**/*.java"],
  },
  tests: ["src/api/java/**/*.java", "src/test/java/**/*.java"],
  scoring: { mode: "weighted" },
  "java-build": {
    kind: "gradle-jar-v1",
    "main-class": "Study",
    artifact: "example.jar",
  },
  "api-precheck": { files: ["src/api/java/**/*.java"], entry: "Api" },
  references: [{
    name: "alternate",
    root: "author/alternate/src/main/java",
    optional: false,
  }],
};
const options = {
  core: Core,
  check,
  runtimeProfile: {
    mode: "implementation",
    javaRelease: 25,
    sourceExtensions: [".java"],
  },
  studentPlan: plan("student"),
  fullPlan: plan("full"),
  student,
  full,
};
const selected = await selectNativeCompilerInputs(options);
if (
  selected.references[0].files.map((x: any) => x.name).join(",") !==
    "Example.java,Study.java"
) throw Error("reference helper not preserved");
if (
  selected.descriptor.apiPrecheck.files.join(",") !== "src/api/java/Api.java" ||
  selected.descriptor.testFiles.length !== 2
) throw Error("API/subject selection changed");
for (
  const [name, mutate] of [
    ["foreign-role", (o: any) => o.full.files[4].reason = "starter"],
    ["dishonest-size", (o: any) => o.full.files[4].size = 0],
    ["changed-bytes", (o: any) => o.full.files[4].bytes[0] = 0],
    ["non-source-helper", (o: any) => {
      o.full.files[4].target = "author/alternate/src/main/java/evil.txt";
      o.check.sourceProfile.include = ["**/*"];
    }],
    ["oversized-helper", async (o: any) => {
      const f = o.full.files[4];
      f.bytes = new Uint8Array(1048577);
      f.size = f.bytes.length;
      f.sha256 = await hash(f.bytes);
    }],
  ] as const
) {
  const { core, ...copy } = options;
  const bad = { ...structuredClone(copy), core };
  await mutate(bad);
  let denied = false;
  try {
    await selectNativeCompilerInputs(bad);
  } catch {
    denied = true;
  }
  if (!denied) throw Error("accepted " + name);
}
console.log(
  JSON.stringify(
    {
      referenceHelpers: selected.references[0].files.map((x: any) => x.name),
      controls: 5,
      descriptor: selected.descriptor,
    },
    null,
    2,
  ),
);
