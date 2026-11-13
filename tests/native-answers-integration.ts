import type * as CorePublic from "course-core/public.ts";
import type * as PLPublic from "../_extensions/course-prairielearn/public.ts";
import { required, setFixture } from "./fixture-values.ts";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const wrongGrading = Deno.args.includes("--wrong-grading");
const author = Deno.args.includes("--author"),
  projection = author ? "author" : "student",
  profile = author ? "full" : "student";
const corePath = resolve(required(Deno.args[0]), "_extensions/course-core"),
  plPath = join(
    dirname(dirname(fileURLToPath(import.meta.url))),
    "_extensions/course-prairielearn",
  );
const Core: typeof CorePublic = await import(
    pathToFileURL(join(corePath, "public.ts")).href
  ),
  PL: typeof PLPublic = await import(
    pathToFileURL(join(plPath, "public.ts")).href
  );
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
 - {at: pre-ast, path: ${corePath}/native-ts/early-context.lua}
 - {at: post-quarto, path: ${corePath}/native-ts/late-kind.lua}
 - {at: post-render, path: ${corePath}/native-ts/late-filter.lua}
`;
await put(".gitignore", "/.quarto/\n**/*.quarto_ipynb\n");
await put(
  "_quarto.yml",
  config
    .replace("default: student", "default: " + profile)
    .replace("view: student", "view: " + profile) +
    "\nproject-checks: {source-profiles: {}, profiles: {}}\nproject-materialization: {projects: {}}\n",
);
await put("_quarto-" + profile + ".yml", "course: {view: " + profile + "}\n");
await put("_extensions/prairielearn/contract.json", '{"name":"prairielearn"}');
await put(
  "pre.ts",
  `import * as Core from ${JSON.stringify(
    pathToFileURL(join(corePath, "public.ts")).href,
  )};import * as PL from ${JSON.stringify(
    pathToFileURL(join(plPath, "public.ts")).href,
  )};await PL.prepareNativeAdapter(Core,{root:Deno.cwd(),projection:${JSON.stringify(
    projection,
  )},outputDirectory:Deno.cwd()+'/_site'});`,
);
await put(
  "index.qmd",
  "---\nprairielearn:\n  question-defaults: {topic: Java, submission: {mode: upload}}\n---\n::: {#exr-manual prairielearn-grading=manual}\n## Ручной ответ\nОбъясните результат.\n\n```{.answer-spec}\ntype: manual\nsubmission: text\n```\n:::\n::: {#exr-numeric}\n## Числовой ответ\nВычислите число.\n\n```{.answer-spec}\ntype: numeric\nkey: {value: 734129, tolerance: {absolute: 0.1}}\n```\n:::\n::: {#exr-parts prairielearn-grading=mixed}\n## Части ответа\nДайте число и объяснение.\n\n```{.answer-spec}\ntype: multipart\nparts:\n - {type: numeric, name: number, label: Число, key: {value: 7, tolerance: {absolute: 0}}}\n - {type: manual, name: reason, label: Объяснение, submission: text}\n```\n:::\n::: {#exr-matching}\n## Соответствие\nСопоставьте слова.\n\n```{.answer-spec}\ntype: matching\nprompts: [Кошка, Собака]\noptions: [Мяу, Гав]\nkey: {pairs: {Кошка: Мяу, Собака: Гав}}\n```\n:::\n:::: {#exr-choice}\n## Выбор\nВыберите ответ.\n\n::: {.answer type=single-choice}\n\n- Нет\n- [Да]{.correct}\n- Возможно\n\n:::\n::::\n",
);
await put(
  "slides.qmd",
  "---\nformat: revealjs\nassessment:\n  id: sec-all\n  kind: lab\n  prairielearn:\n    pass: {at-least: 1}\n    attempts: 3\n    assignment: {mode: assessment-id}\n    slot-overrides:\n      exr-manual: {auto-points: 0, manual-points: 20}\n      exr-parts: {auto-points: 80, manual-points: 20}\n      exr-numeric: {question-points: 1}\n      exr-matching: {question-points: 1}\n      exr-choice: {question-points: 1}\n---\n# Все формы\n\nВводный текст работы.\n\n::: {.task-items}\n- @exr-manual\n- @exr-numeric\n- @exr-parts\n- @exr-matching\n- @exr-choice\n:::\n",
);
if (wrongGrading) {
  await put(
    "slides.qmd",
    (await Deno.readTextFile(join(root, "slides.qmd"))).replace(
      "exr-manual: {auto-points: 0, manual-points: 20}",
      "exr-manual: {question-points: 1}",
    ),
  );
}
await Core.withNativeCaptureScope(
  { root, projection, outputDirectory: root + "/_site" },
  { expectedSources: ["index.qmd", "slides.qmd"] },
  async (scope) => {
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
await Core.withCurrentNativeOperation(
  {
    root,
    profiles: [profile],
    projection,
    outputDirectory: root + "/_site",
    expectedDocuments: [
      { source: "index.qmd", format: "html" },
      {
        source: "slides.qmd",
        format: "revealjs",
      },
    ],
  },
  async (op) => {
    const adapter = PL.createNativeAdapter({ root, core: Core });
    if (wrongGrading) {
      let error = "";
      try {
        await adapter.validateCourse(op, {
          expectedSources: ["index.qmd", "slides.qmd"],
        });
      } catch (e) {
        error = String(e);
      }
      if (!error.includes("PL.GRADING_INVALID")) {
        throw Error("cross-document wrong grading accepted: " + error);
      }
      let retained = false;
      try {
        adapter.business("index.qmd");
        retained = true;
      } catch {}
      if (retained) {
        throw Error("failed composition retained consumable business");
      }
      console.log(
        JSON.stringify(
          {
            root,
            refused:
              "authentic cross-document manual question with automatic points",
            error,
          },
          null,
          2,
        ),
      );
      return;
    }
    const proof = await adapter.validateCourse(op, {
      expectedSources: ["index.qmd", "slides.qmd"],
    });
    const input = adapter.validatedInput("index.qmd");
    if (Deno.args.includes("--assignment-consumer-refusal")) {
      let error = "";
      try {
        await adapter.assignmentDelivery(
          op,
          { source: "slides.qmd", assessmentId: "sec-all" },
          { projectPlans: [] },
          { expectedSources: ["index.qmd", "slides.qmd"] },
        );
      } catch (cause) {
        error = String(cause);
      }
      if (!error.includes("BODY.ASSIGNMENT_REQUIRED")) {
        throw Error(
          "ordinary operation acquired assignment or wrong refusal: " + error,
        );
      }
      console.log(
        JSON.stringify(
          {
            status: "REAL_ORDINARY_OPERATION_REFUSED_NOT_ASSIGNMENT_POSITIVE",
            error,
            metrics: op.metrics,
          },
          null,
          2,
        ),
      );
      return;
    }
    // Сериализованный input — данные, не Core authority: чистый вызов не
    // наполняет cache и не даёт читать business/private answers.
    const external = PL.createNativeAdapter({ root, core: Core });
    await external.validate(structuredClone(input));
    let cached = false;
    try {
      external.business("index.qmd");
      cached = true;
    } catch {}
    if (cached) throw Error("DTO validation created business authority");
    for (const nativeMetadata of [
      undefined,
      { foreign: {} },
      { readSet: ["configuration"], values: {} },
    ]) {
      const bad = structuredClone(input);
      setFixture(bad, ["nativeMetadata"], nativeMetadata);
      let refused = false;
      try {
        await external.validate(bad);
      } catch {
        refused = true;
      }
      if (!refused)
        throw Error("Missing/unknown native metadata or old envelope accepted");
    }

    if (
      input.declarations
        .map((d) => d.answer?.type)
        .sort()
        .join(",") !== "manual,matching,multipart,numeric,single-choice"
    )
      throw Error("canonical answers lost");
    const publicBytes = JSON.stringify({
      catalog: op.catalog,
      documents: [
        op.document({ source: "index.qmd" }),
        op.document({ source: "slides.qmd" }),
      ],
      proof,
    });
    if (
      publicBytes.includes("734129") ||
      publicBytes.includes('"correct"') ||
      publicBytes.includes('"pairs"')
    )
      throw Error("closed answer leaked to public DTO");
    console.log(
      JSON.stringify(
        {
          root,
          proof,
          forms: input.declarations.map((d) => ({
            id: d.id,
            type: required(d.answer).type,
          })),
          metrics: op.metrics,
        },
        null,
        2,
      ),
    );
  },
);
