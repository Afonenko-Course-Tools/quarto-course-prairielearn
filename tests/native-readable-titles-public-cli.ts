// Настоящая нумерованная книга проходит штатный публичный PL CLI.
import { strict as assert } from "node:assert";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [coreArg, catalogArg, downloadArg, mapArg] = Deno.args;
if (!coreArg || !catalogArg || !downloadArg || !mapArg) {
  throw Error("Требуются Source Core, QRC, Download и фактическая import map");
}
const core = resolve(coreArg), catalog = resolve(catalogArg),
  download = resolve(downloadArg), map = resolve(mapArg);
const repo = dirname(dirname(fileURLToPath(import.meta.url)));

async function copy(source: string, target: string): Promise<void> {
  const info = await Deno.lstat(source);
  assert(!info.isSymlink, "Фикстура не копирует symlink: " + source);
  if (info.isDirectory) {
    await Deno.mkdir(target, { recursive: true });
    for await (const child of Deno.readDir(source)) {
      await copy(join(source, child.name), join(target, child.name));
    }
  } else {
    assert(info.isFile, "Ожидался обычный файл: " + source);
    await Deno.copyFile(source, target);
    if (info.mode !== null) await Deno.chmod(target, info.mode & 0o777);
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function readObject(path: string): Promise<Record<string, unknown>> {
  const value: unknown = JSON.parse(await Deno.readTextFile(path));
  if (!isObject(value)) {
    throw Error("Ожидался JSON object: " + path);
  }
  return value;
}

const root = await Deno.makeTempDir({ prefix: "pl-readable-titles-cli-" });
try {
  const book = join(root, "tasks");
  await copy(join(core, "tests/fixtures/native-readable-titles-book"), book);
  for (const [source, name] of [
    [core, "course-core"], [repo, "course-prairielearn"],
    [catalog, "reference-catalog"], [download, "project-download"],
  ] as const) {
    await copy(join(source, "_extensions", name), join(book, "_extensions", name));
  }
  await Deno.writeTextFile(join(book, ".gitignore"),
    "/.quarto/\n/_generated/\n/_site/\n/_extensions/\n");
  await Deno.writeTextFile(join(book, "_quarto.yml"), `project:
  type: book
  output-dir: _site
  pre-render: [_extensions/course-core/entrypoints/pre.ts]
  post-render:
    - _extensions/reference-catalog/entrypoints/post.ts
    - _extensions/course-core/entrypoints/post.ts
book:
  title: Проверка названий
  chapters: [index.qmd, work.qmd]
format: {html: {theme: none}}
lang: ru
number-sections: true
filters: [course-core, reference-catalog]
course: {id: readable-titles, view: student, adapters: [prairielearn]}
course-core-runtime: native-ts
course-core-projection: student
course-navigation: {course-url: https://example.invalid/titles/}
reference-catalog: {namespace: tasks}
exercise-bank: true
default-exercise-difficulty: introductory
default-exercise-time: 5
default-exercise-course-role: false
default-exercise-target: prairielearn
default-exercise-statement-visibility: open
prairielearn:
  question-defaults:
    topic: Test
    single-variant: true
    grading: {method: manual}
    submission: {mode: upload}
  assessment-defaults:
    assignment: {mode: assessment-id}
    attempts: 1
    pass: {at-least: 1}
  delivery:
    book: tasks
    course:
      name: Titles
      title: Проверка названий
      timezone: Europe/Minsk
      topics: [{name: Test, color: blue2, description: Проверка названий}]
    instances:
      fixture:
        title: Проверка
        self-enrollment: false
        works: [sec-work]
        publishing: {start-date: '2026-01-01T00:00:00Z', end-date: '2027-01-01T00:00:00Z'}
`);
  await Deno.writeTextFile(join(book, "_quarto-full.yml"),
    "course-core-projection: author\ncourse:\n  view: full\n");
  const workPath = join(book, "work.qmd");
  const work = await Deno.readTextFile(workPath);
  assert(work.includes("assessment: {id: sec-work, kind: lab}"));
  await Deno.writeTextFile(workPath, work.replace(
    "assessment: {id: sec-work, kind: lab}",
    "assessment:\n  id: sec-work\n  kind: lab\n  prairielearn:\n    auto-points: 0\n    manual-points: 20",
  ));
  const output = join(root, "native");
  const result = await new Deno.Command(Deno.execPath(), {
    args: ["run", "--no-config", "--no-lock", "--import-map", map, "-A",
      join(book, "_extensions/course-prairielearn/entrypoints/export-course.ts"),
      root, output, "--instance", "fixture", "--checks-output",
      join(root, "private-checks.json"), "--book", "tasks"],
    cwd: root, stdout: "piped", stderr: "piped",
  }).output();
  assert(result.success, new TextDecoder().decode(result.stderr));
  const assessment = await readObject(join(output,
    "courseInstances/fixture/assessments/sec-work/infoAssessment.json"));
  const questionPath = join(output, "questions/readable-titles/exr-one");
  const question = await readObject(join(questionPath, "info.json"));
  const html = await Deno.readTextFile(join(questionPath, "question.html"));
  assert.equal(assessment.title, "24.0.8 Числа — ёж x < 3 ссылка α β");
  assert.equal(question.title, "7. Число Main.java ссылка ёж");
  const visible = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
  assert(visible.includes("Авторское условие с числом 24.0.8."));
  assert(!/chapter-number|chapter-title|quarto-section-identifier|question-link|question-span|authored-id|key=value/.test(visible));
  console.log("PASS: публичный PL CLI сохранил названия и авторское условие настоящей нумерованной книги");
} finally {
  await Deno.remove(root, { recursive: true });
}
