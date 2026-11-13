// Воспроизводимый synthetic book для настоящей native UI-приёмки; пользовательских данных нет.
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const [targetArg, phase, coreArg, qrcArg, downloadArg, registryArg, mapArg] =
  Deno.args;
if (
  !targetArg ||
  !["editor", "upload"].includes(phase ?? "") ||
  !coreArg ||
  !qrcArg ||
  !downloadArg ||
  !registryArg ||
  !mapArg
) {
  throw Error(
    "Требуются NEW_TARGET editor|upload CORE QRC DOWNLOAD RUNTIME_REGISTRY IMPORT_MAP",
  );
}
const root = resolve(targetArg),
  book = join(root, "tasks");
try {
  await Deno.lstat(root);
  throw Error("Нужен новый TARGET: " + root);
} catch (error) {
  if (!(error instanceof Deno.errors.NotFound)) throw error;
}
await Deno.mkdir(book, { recursive: true });
const repo = dirname(dirname(fileURLToPath(import.meta.url)));
async function copy(source: string, target: string): Promise<void> {
  const stat = await Deno.lstat(source);
  if (stat.isSymlink) throw Error("Symlink запрещён: " + source);
  if (stat.isDirectory) {
    await Deno.mkdir(target, { recursive: true });
    for await (const child of Deno.readDir(source)) {
      await copy(join(source, child.name), join(target, child.name));
    }
  } else {
    await Deno.copyFile(source, target);
    if (stat.mode !== null) await Deno.chmod(target, stat.mode & 0o777);
  }
}
for (const [source, name] of [
  [coreArg, "course-core"],
  [repo, "course-prairielearn"],
  [qrcArg, "reference-catalog"],
  [downloadArg, "project-download"],
]) {
  if (!source || !name) throw Error("Неполная dependency");
  await copy(
    join(resolve(source), "_extensions", name),
    join(book, "_extensions", name),
  );
}
async function put(path: string, text: string) {
  await Deno.mkdir(dirname(join(book, path)), { recursive: true });
  await Deno.writeTextFile(join(book, path), text);
}
await put(".gitignore", "/.quarto/\n/_generated/\n/_site/\n/_extensions/\n");
await put(
  "_quarto.yml",
  `project:
  type: book
  output-dir: _site
  pre-render: [_extensions/course-core/entrypoints/pre.ts]
  post-render: [_extensions/reference-catalog/entrypoints/post.ts, _extensions/course-core/entrypoints/post.ts]
book: {title: Native editor closure, chapters: [index.qmd, work.qmd]}
format: {html: {theme: none}}
lang: ru
number-sections: true
filters: [course-core, reference-catalog]
course: {id: pl-editor-closure, view: student, adapters: [prairielearn]}
course-core-runtime: native-ts
course-core-projection: student
course-navigation: {course-url: 'https://example.invalid/editor/'}
reference-catalog: {namespace: tasks}
exercise-bank: true
default-exercise-difficulty: introductory
default-exercise-time: 5
default-exercise-course-role: false
default-exercise-target: prairielearn
default-exercise-statement-visibility: open
project-checks:
  defaults:
    runtime: java25-junit-v1
    scoring: {mode: weighted}
    references: [{name: correct, root: author/correct/src/main/java, optional: false}]
    discovery: {min-executed: 1}
  source-profiles:
    main: {mode: implementation, root: src/main/java, include: ['**/*.java']}
  profiles:
    junit:
      source-profile: main
      tests: ['src/test/java/**/*.java']
      additional-java-sources: {archive: solution.zip, primary-required: false, allow-additional: true, max-files: 16, max-file-bytes: 65536, max-total-bytes: 262144, max-archive-bytes: 262144}
prairielearn:
  question-defaults: {topic: Java, single-variant: true, submission: {mode: editor, ace-mode: ace/mode/java}}
  assessment-defaults: {assignment: {mode: assessment-id}, attempts: 10, pass: {at-least: 1}, question-points: 10}
  delivery:
    book: tasks
    course:
      name: PL-EDITOR-CLOSURE
      title: Изолированная приёмка редактора
      timezone: Europe/Minsk
      topics: [{name: Java, color: blue2, description: Synthetic acceptance}]
    instances:
      fixture:
        title: Приёмка
        self-enrollment: false
        works: [sec-editor]
        publishing: {start-date: '2026-01-01T00:00:00Z', end-date: '2028-01-01T00:00:00Z'}
`,
);
await put(
  "_quarto-full.yml",
  "course-core-projection: author\ncourse: {view: full}\n",
);
await put(
  "index.qmd",
  "# Приёмка\n\nОтдельный synthetic курс без пользовательских данных.\n",
);
await put(
  "work.qmd",
  `---
assessment: {id: sec-editor, kind: lab, prairielearn: {}}
---
# Редактор [Java](https://example.invalid/) — ёж α

:::: {#exr-editor project="/projects/editor" project-check="junit"}
## Сумма α β
Реализуйте \`demo.Add.sum(int, int)\` через \`demo.Helper.sum(int, int)\`.
Результат — long; расширение типа выполняется до сложения. Стартовый комплект пригоден для локальной IDE.
::::

::: {.task-items stage="homework"}
1. @exr-editor
:::
`,
);
await put(
  "projects/editor/_metadata.yml",
  `course-project:
  starter: {path: student}
  testsets: {checks: {path: checks}}
  delivery: {student: {testsets: {checks: false}}}
  verification: {testsets: {checks: true}}
  solutions: {correct: {path: reference}}
`,
);
const add =
  "package demo;\npublic class Add { public static long sum(int a, int b) { return Helper.sum(a, b); } }\n";
const helper =
  "package demo;\npublic class Helper { public static long sum(int a, int b) { return (long) a + b; } }\n";
for (const [name, code] of [
  ["Add.java", add],
  ["Helper.java", helper],
] as const) {
  await put(
    "projects/editor/student/src/main/java/demo/" + name,
    name === "Helper.java" ? code.replace("(long) a + b", "0") : code,
  );
  await put("projects/editor/reference/src/main/java/demo/" + name, code);
}
if (phase === "upload") {
  const marker = "package demo;\npublic class Marker {}\n";
  await put("projects/editor/student/src/main/java/demo/Marker.java", marker);
  await put("projects/editor/reference/src/main/java/demo/Marker.java", marker);
}
await put(
  "projects/editor/checks/src/test/java/demo/AddTest.java",
  `package demo;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertEquals;
class AddTest {
  @Test void ordinary() { assertEquals(5L, Add.sum(2, 3)); }
  @Test void overflow() { assertEquals(2147483648L, Add.sum(Integer.MAX_VALUE, 1)); }
}
`,
);
await Deno.mkdir(join(root, "answers/correct"), { recursive: true });
await Deno.mkdir(join(root, "answers/incomplete"), { recursive: true });
await Deno.mkdir(join(root, "answers/error"), { recursive: true });
for (const scenario of ["correct", "incomplete", "error"]) {
  await Deno.writeTextFile(join(root, "answers", scenario, "Add.java"), add);
  await Deno.writeTextFile(
    join(root, "answers", scenario, "Helper.java"),
    scenario === "correct"
      ? helper
      : scenario === "incomplete"
        ? helper.replace("(long) a + b", "0")
        : helper.replace("(long) a + b", "missingSymbol"),
  );
}
await Deno.writeFile(
  join(root, "runtime-profiles.json"),
  await Deno.readFile(resolve(registryArg)),
);
const result = await new Deno.Command(Deno.execPath(), {
  args: [
    "run",
    "--no-config",
    "--no-lock",
    "--import-map",
    resolve(mapArg),
    "-A",
    join(book, "_extensions/course-prairielearn/entrypoints/export-course.ts"),
    root,
    join(root, "native"),
    "--instance",
    "fixture",
    "--checks-output",
    join(root, "checks.json"),
    "--runtime-registry",
    join(root, "runtime-profiles.json"),
    "--book",
    "tasks",
  ],
  cwd: root,
  stdout: "inherit",
  stderr: "inherit",
}).spawn().status;
if (!result.success) throw Error("Fixture export failed: " + result.code);
console.log("Fixture: " + root + " phase=" + phase);
