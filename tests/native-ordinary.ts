import { join } from "node:path";
const coreArgument = Deno.args[0];
if (!coreArgument) throw Error("usage: native-ordinary.ts CORE");
const core = await Deno.realPath(coreArgument);
const repo = Deno.cwd(),
  root = await Deno.makeTempDir({ prefix: "native-ordinary-" });
const adapter = "prairielearn";
async function command(args: string[], expectedFailure?: string) {
  const result = await new Deno.Command(Deno.env.get("QUARTO") || "quarto", {
    args,
    cwd: root,
    stdout: "piped",
    stderr: "piped",
  }).output();
  const text = new TextDecoder().decode(result.stderr) +
    new TextDecoder().decode(result.stdout);
  if (expectedFailure) {
    if (result.success || !text.includes(expectedFailure)) throw Error(text);
  } else if (!result.success) throw Error(text);
}
try {
  await command(["add", core, "--no-prompt"]);
  await command(["add", repo, "--no-prompt"]);
  await Deno.writeTextFile(
    join(root, "_quarto.yml"),
    `project:
  type: default
  pre-render: _extensions/course-core/entrypoints/pre.ts
  post-render: _extensions/course-core/entrypoints/post.ts
format: html
filters: [course-core, course-${adapter}]
course:
  adapters: [${adapter}]
`,
  );
  await Deno.writeTextFile(
    join(root, "index.qmd"),
    "# Native exercises\n\n::: {#exr-native}\nOrdinary exercise without owner, target or educational metadata.\n:::\n",
  );
  await command(["render", "--fail-if-warnings"]);
  const html = await Deno.readTextFile(join(root, "index.html"));
  if (!html.includes("Ordinary exercise")) {
    throw Error("native render lost condition");
  }
  console.log(
    "Installed " + adapter +
      " leaves native rendering valid without course identity",
  );
  // Отсутствующий optional topic не должен ломать частичный HTML reader.
  const configuration = `project:
  type: default
  pre-render: _extensions/course-core/entrypoints/pre.ts
  post-render: _extensions/course-core/entrypoints/post.ts
format: html
filters: [course-core, course-prairielearn]
course:
  id: partial-topic
  view: student
  adapters: [prairielearn]
exercise-bank: true
default-exercise-project-check: false
default-exercise-statement-visibility: open
prairielearn:
  question-defaults:
    single-variant: true
    grading: {method: manual}
    submission: {mode: upload}
`;
  await Deno.mkdir(join(root, "projects/example/student"), {recursive: true});
  await Deno.writeTextFile(join(root, "projects/example/student/README.md"), "Публичная инструкция\n");
  await Deno.writeTextFile(join(root, "index.qmd"), `# Открытые задания

:::: {#exr-default target="prairielearn" difficulty="introductory" time="5" project="/projects/example"}
## Обычный вопрос
Публичное условие.
::::

:::: {#exr-override target="prairielearn" difficulty="introductory" time="5" project="/projects/example" prairielearn-topic="Override"}
## Явная тема
Публичное условие.
::::
`);
  async function payloads() {
    const pointer = JSON.parse(await Deno.readTextFile(join(root, "_generated/course-spec/active-native-run.json")));
    const folder = join(pointer.directory, "adapters/prairielearn");
    const exercises: any[] = [];
    for await (const file of Deno.readDir(folder)) {
      if (!file.name.endsWith(".json") || file.name === "contract.json") continue;
      exercises.push(...JSON.parse(await Deno.readTextFile(join(folder, file.name))).exercises);
    }
    if (exercises.length !== 2) throw Error("Reader потерял выбранные вопросы");
    for (const row of exercises) {
      if (row.payload.grading.method !== "manual" || row.payload.submission.mode !== "upload" || row.payload["single-variant"] !== true) {
        throw Error("Reader потерял manual/upload/single-variant");
      }
    }
    return new Map(exercises.map(row => [row.id, row.payload]));
  }
  await Deno.writeTextFile(join(root, "_quarto.yml"), configuration);
  await command(["render", "--fail-if-warnings"]);
  const absent = await payloads();
  if (Object.hasOwn(absent.get("exr-default"), "topic") || absent.get("exr-override").topic !== "Override") {
    throw Error("Reader выдумал отсутствующую тему или потерял override");
  }
  await Deno.writeTextFile(join(root, "_quarto.yml"), configuration.replace("  question-defaults:\n", "  question-defaults:\n    topic: Known\n"));
  await command(["render", "--fail-if-warnings"]);
  const explicit = await payloads();
  if (explicit.get("exr-default").topic !== "Known" || explicit.get("exr-override").topic !== "Override") {
    throw Error("Reader изменил явную тему или override");
  }
  // Полные delivery declarations по-прежнему требуют тему.
  await Deno.writeTextFile(join(root, "_quarto.yml"), configuration.replace("prairielearn:\n", `prairielearn:
  delivery:
    book: tasks
    course:
      name: TOPIC
      title: Тема
      timezone: Europe/Minsk
      topics: [{name: Known, color: blue2, description: Тема}]
    instances:
      pilot:
        title: Проверка
        self-enrollment: false
        publishing: {start-date: '1970-01-01T00:00:00Z', end-date: '9999-12-31T00:00:00Z'}
        works: []
`));
  await command(["render", "--fail-if-warnings"], '"question-defaults".topic');
  console.log("PASS частичный HTML без topic, manual/upload/single-variant, явная тема/override и обязательный topic полной delivery");
} finally {
  await Deno.remove(root, { recursive: true });
}
