import { readNativeAdapterExpectation } from "../_extensions/course-prairielearn/application/native-adapter.ts";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const corePath = join(Deno.args[0], "_extensions/course-core"),
  plPath = join(
    dirname(dirname(fileURLToPath(import.meta.url))),
    "_extensions/course-prairielearn",
  );
const Core = await import(pathToFileURL(join(corePath, "public.ts")).href),
  PL = await import(pathToFileURL(join(plPath, "public.ts")).href);
const root = await Deno.makeTempDir({ prefix: "pl-scope-" }),
  checks: string[] = [];
async function put(path: string, text: string) {
  await Deno.mkdir(dirname(join(root, path)), { recursive: true });
  await Deno.writeTextFile(join(root, path), text);
}
const config = `project:
  type: website
  output-dir: _site
  pre-render: [quarto run ${corePath}/entrypoints/native-pre.ts, quarto run pre.ts]
  post-render: [quarto run ${corePath}/entrypoints/native-post.ts]
profile:
  default: student
format:
  html:
    theme: none
course: {id: scope-fixture, view: student, adapters: [prairielearn]}
course-core-runtime: native-ts
exercise-bank: true
default-exercise-statement-visibility: open
default-exercise-difficulty: introductory
default-exercise-time: 7
default-exercise-course-role: false
default-exercise-target: prairielearn
filters:
 - {at: pre-ast, path: ${plPath}/native-ts/raw-capture.lua}
 - {at: pre-ast, path: ${corePath}/native-ts/early-context.lua}
 - {at: post-quarto, path: ${corePath}/native-ts/late-kind.lua}
 - {at: post-render, path: ${corePath}/native-ts/late-filter.lua}
`;
await put("_quarto.yml", config);
await put("_quarto-student.yml", "course: {view: student}\n");
await put("_extensions/prairielearn/contract.json", '{"name":"prairielearn"}');
await put(
  "pre.ts",
  `import * as Core from ${
    JSON.stringify(pathToFileURL(join(corePath, "public.ts")).href)
  };import * as PL from ${
    JSON.stringify(pathToFileURL(join(plPath, "public.ts")).href)
  };await PL.prepareNativeAdapter(Core,{root:Deno.cwd(),projection:'student',outputDirectory:Deno.cwd()+'/_site'});`,
);
await put(
  "index.qmd",
  `---
prairielearn:
  question-defaults: {topic: Git, grading: {method: manual}, submission: {mode: upload}}
---
::: {#exr-example project=project prairielearn-grading=manual}
## Задача
Условие.
:::
`,
);
await put(
  "slides.qmd",
  "---\nformat: revealjs\n---\n# Пустая страница\n\nNative отсутствие metadata.\n",
);
await put("project/input.txt", "Starter\n");
await Core.withNativeCaptureScope(
  { root, projection: "student", outputDirectory: root + "/_site" },
  { expectedSources: ["index.qmd", "slides.qmd"] },
  async (scope: any) => {
    for (const source of ["index.qmd", "slides.qmd"]) {
      await scope.captureInputs([source], async (token: string) => {
        const r = await new Deno.Command("quarto", {
          args: ["render", source],
          cwd: root,
          env: {
            COURSE_CORE_CAPTURE_TOKEN: token,
            QUARTO_RUN_NO_NETWORK: "true",
            DENO_NO_PACKAGE_JSON: "1",
          },
          stdout: "piped",
          stderr: "piped",
        }).output();
        if (!r.success) {
          throw Error(new TextDecoder().decode(r.stderr));
        }
      });
    }
  },
);
const candidate = await readNativeAdapterExpectation(Core, root);
if (
  candidate.identity.profiles.join(",") !== "student" ||
  candidate.expectation.outputDirectory !== root + "/_site"
) throw Error("CLI candidate lost actual pending identity");
await Core.withCurrentNativeOperation({
  root,
  profiles: ["student"],
  projection: "student",
  outputDirectory: root + "/_site",
  expectedDocuments: [{ source: "index.qmd", format: "html" }, {
    source: "slides.qmd",
    format: "revealjs",
  }],
}, async (op: any) => {
  const adapter = PL.createNativeAdapter({
    root,
    core: Core,
    preparedIdentity: candidate.identity,
  });
  const proof = await op.validateRelease({
    expectedSources: ["index.qmd", "slides.qmd"],
  }, [adapter]);
  if (
    proof.documents.map((d: any) => d.format).sort().join(",") !==
      "html,revealjs"
  ) throw Error("mixed formats lost");
  checks.push(
    "actual mixed format scope; both captures retained; native default student",
  );
  if (Object.keys(adapter.business("slides.qmd").questions).length) {
    throw Error("absent namespace synthesized question");
  }
  checks.push("four authoritative absent slots accepted");
  const base = join(root, "_generated/course-spec/prairielearn-native"),
    active = JSON.parse(await Deno.readTextFile(join(base, "active.json"))),
    request = JSON.parse(
      await Deno.readTextFile(join(base, active.operation, "request.json")),
    ),
    ref = request.inputs.find((i: any) => i.source === "slides.qmd"),
    path = join(base, active.operation, ref.file),
    original = await Deno.readTextFile(path);
  for (
    const [plane, value] of [
      ["config", {}],
      ["assessment", { attempts: 1, pass: { "at-least": 1 } }],
      ["projectChecks", { "source-profiles": {}, profiles: {} }],
      ["materialization", { projects: {} }],
    ] as const
  ) {
    const raw = JSON.parse(original);
    raw.business[plane] = value;
    await Deno.writeTextFile(path, JSON.stringify(raw));
    let error = "";
    try {
      await op.validateRelease(
        { expectedSources: ["index.qmd", "slides.qmd"] },
        [PL.createNativeAdapter({ root, core: Core })],
      );
    } catch (e) {
      error = String(e);
    } finally {
      await Deno.writeTextFile(path, original);
    }
    if (!error.includes("PL.CAPTURE_CHANGED")) {
      throw Error("added absent plane accepted: " + plane + error);
    }
    checks.push("added absent " + plane + " refused");
  }
  const requestPath = join(base, active.operation, "request.json"),
    originalRequest = await Deno.readTextFile(requestPath);
  for (
    const [label, change] of [
      ["profiles", (r: any) => r.identity.profiles = ["foreign"]],
      ["output", (r: any) => r.outputDirectory = root + "/_foreign"],
      ["owner", (r: any) => r.owner = root + "/foreign"],
      ["missing-output", (r: any) => delete r.outputDirectory],
    ] as const
  ) {
    const r = JSON.parse(originalRequest);
    change(r);
    await Deno.writeTextFile(requestPath, JSON.stringify(r));
    let error = "";
    try {
      const bad = await readNativeAdapterExpectation(Core, root);
      await Core.withCurrentNativeOperation(
        bad.expectation,
        async (current: any) => {
          await PL.createNativeAdapter({
            root,
            core: Core,
            preparedIdentity: bad.identity,
          }).validateCourse(current, { expectedSources: bad.expectedSources });
        },
      );
    } catch (e) {
      error = String(e);
    } finally {
      await Deno.writeTextFile(requestPath, originalRequest);
    }
    if (!error) throw Error("CLI candidate forgery accepted " + label);
    checks.push("CLI " + label + " candidate refused");
  }
  console.log(JSON.stringify({ root, checks, metrics: op.metrics }, null, 2));
});
