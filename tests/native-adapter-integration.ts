import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL as toFileUrl } from "node:url";

// Запуск: quarto run tests/native-adapter-integration.ts <immutable Core snapshot>.
const snapshot = Deno.args[0];
if (!snapshot) throw Error("Требуется точный Core snapshot");
const corePath = join(snapshot, "_extensions/course-core");
const Core = await import(toFileUrl(join(corePath, "public.ts")).href);
const plPath = join(
  dirname(dirname(fileURLToPath(import.meta.url))),
  "_extensions/course-prairielearn",
);
const PL = await import(toFileUrl(join(plPath, "public.ts")).href);
const root = await Deno.makeTempDir({ prefix: "pl-native-actual-" });
const checks: { name: string; passed: boolean }[] = [];
function check(name: string, passed: boolean) {
  checks.push({ name, passed });
  if (!passed) throw Error(name);
}
async function put(path: string, bytes: string) {
  await Deno.mkdir(dirname(join(root, path)), { recursive: true });
  await Deno.writeTextFile(join(root, path), bytes);
}
async function refuse(name: string, callback: () => unknown, expected: string) {
  let error = "";
  try {
    await callback();
  } catch (e) {
    error = String(e);
  }
  check(
    name + (!error.includes(expected) ? ": " + error : ""),
    error.includes(expected),
  );
}
await put(
  "_extensions/prairielearn/contract.json",
  JSON.stringify({ name: "prairielearn" }),
);
await put("project/input.txt", "Стартовый материал\n");
await put(
  "index.qmd",
  `::: {#exr-open project=project prairielearn-grading=manual}
## Открытая задача

Учебное условие.
:::

::: {#exr-restricted project=project statement-visibility=restricted prairielearn-grading=manual}
## Ограниченная задача

Ограниченный материал.
:::
`,
);
await put(
  "pre.ts",
  `import * as Core from ${
    JSON.stringify(toFileUrl(join(corePath, "public.ts")).href)
  };
import * as PL from ${
    JSON.stringify(toFileUrl(join(plPath, "public.ts")).href)
  };
await PL.prepareNativeAdapter(Core,{root:Deno.cwd(),profiles:[],format:'html',projection:'student',outputDirectory:Deno.cwd()+'/_site'});`,
);
await put(
  "_quarto.yml",
  `project:
  type: website
  output-dir: _site
  pre-render: [quarto run ${corePath}/entrypoints/native-pre.ts, quarto run pre.ts]
  post-render: [quarto run ${corePath}/entrypoints/native-post.ts]
format:
  html:
    theme: none
course: {id: pl-native-fixture, view: student, adapters: [prairielearn]}
course-core-runtime: native-ts
exercise-bank: true
default-exercise-statement-visibility: open
default-exercise-target: prairielearn
default-exercise-difficulty: introductory
default-exercise-time: 7
default-exercise-course-role: false
prairielearn:
  question-defaults:
    topic: Git
    grading: {method: manual}
    submission: {mode: upload}
filters:
  - at: pre-ast
    path: ${plPath}/native-ts/raw-capture.lua
  - at: pre-ast
    path: ${corePath}/native-ts/early-context.lua
  - at: post-quarto
    path: ${corePath}/native-ts/late-kind.lua
  - at: post-render
    path: ${corePath}/native-ts/late-filter.lua
`,
);
async function render() {
  const r = await new Deno.Command("quarto", {
    args: ["render", "index.qmd", "--to", "html"],
    cwd: root,
    env: { QUARTO_RUN_NO_NETWORK: "true", DENO_NO_PACKAGE_JSON: "1" },
    stdout: "piped",
    stderr: "piped",
  }).output();
  const log = new TextDecoder().decode(r.stdout) +
    new TextDecoder().decode(r.stderr);
  await put("_generated/pl-native-render.log", log);
  if (!r.success) throw Error(root + "\n" + log);
}
const expectation = {
  root,
  profiles: [],
  format: "html",
  projection: "student",
  outputDirectory: root + "/_site",
};
await render();
const base = join(root, "_generated/course-spec/prairielearn-native");
async function rawPath() {
  const active = JSON.parse(await Deno.readTextFile(join(base, "active.json")));
  const folder = join(base, active.operation);
  const request = JSON.parse(
    await Deno.readTextFile(join(folder, "request.json")),
  );
  return join(folder, request.inputs[0].file);
}
const firstPath = await rawPath(), first = await Deno.readTextFile(firstPath);
await Core.withCurrentNativeOperation(expectation, async (op: any) => {
  const other = await Deno.makeTempDir({ prefix: "pl-foreign-owner-" });
  try {
    await Deno.mkdir(join(other, "_generated/course-spec"), {
      recursive: true,
    });
    const copy = await new Deno.Command("cp", {
      args: [
        "-R",
        base,
        join(other, "_generated/course-spec/prairielearn-native"),
      ],
      stdout: "piped",
      stderr: "piped",
    }).output();
    if (!copy.success) throw Error("foreign capture fixture");
    await refuse(
      "copied-capture-foreign-owner-refused",
      () =>
        op.validateRelease({ expectedSources: ["index.qmd"] }, [
          PL.createNativeAdapter({ root: other, core: Core }),
        ]),
      "PL.CAPTURE_CHANGED",
    );
  } finally {
    await Deno.remove(other, { recursive: true });
  }
  const adapter = PL.createNativeAdapter({ root, core: Core });
  const proof = await op.validateRelease({ expectedSources: ["index.qmd"] }, [
    adapter,
  ]);
  check(
    "actual-public-executable-validator",
    proof.validatedAdapters.includes("prairielearn"),
  );
  check(
    "raw-capture-before-student-projection",
    JSON.parse(first).business.declarations.some((d: any) =>
      d.id === "exr-restricted"
    ) && !op.document({ source: "index.qmd" }).definitions["exr-restricted"],
  );
  check(
    "manual-owner-business",
    adapter.business("index.qmd").questions["exr-open"].grading.method ===
      "manual",
  );
  await refuse(
    "missing-real-adapter",
    () => op.validateRelease({ expectedSources: ["index.qmd"] }),
    "RELEASE.ADAPTER_UNQUALIFIED",
  );
  const raw = JSON.parse(first);
  raw.business.declarations.find((d: any) => d.id === "exr-restricted")
    .attributes["prairielearn-submit"] = "upload";
  await Deno.writeTextFile(firstPath, JSON.stringify(raw));
  await refuse(
    "restricted-malformed-raw-still-refused",
    () =>
      op.validateRelease({ expectedSources: ["index.qmd"] }, [
        PL.createNativeAdapter({ root, core: Core }),
      ]),
    "PL.DECLARATION_INVALID",
  );
  await Deno.writeTextFile(firstPath, first);
});
await render();
const secondPath = await rawPath(),
  second = await Deno.readTextFile(secondPath);
await Deno.writeTextFile(secondPath, first);
await Core.withCurrentNativeOperation(expectation, async (op: any) => {
  await refuse(
    "equal-source-bytes-old-generation-refused",
    () =>
      op.validateRelease({ expectedSources: ["index.qmd"] }, [
        PL.createNativeAdapter({ root, core: Core }),
      ]),
    "PL.CAPTURE_CHANGED",
  );
  await Deno.writeTextFile(secondPath, second);
  await op.validateRelease({ expectedSources: ["index.qmd"] }, [
    PL.createNativeAdapter({ root, core: Core }),
  ]);
});
const old = await Deno.readTextFile(join(root, "project/input.txt"));
try {
  await refuse(
    "captured-project-content-currentness",
    () =>
      Core.withCurrentNativeOperation(expectation, async (op: any) => {
        await Deno.writeTextFile(
          join(root, "project/input.txt"),
          old + "Изменение\n",
        );
        await op.validateRelease({ expectedSources: ["index.qmd"] }, [
          PL.createNativeAdapter({ root, core: Core }),
        ]);
      }),
    "OPERATION_CHANGED",
  );
} finally {
  await Deno.writeTextFile(join(root, "project/input.txt"), old);
}
console.log(JSON.stringify({ root, checks }, null, 2));
