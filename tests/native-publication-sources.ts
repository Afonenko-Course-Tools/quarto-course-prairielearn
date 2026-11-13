import { required } from "./fixture-values.ts";
// Genuine ordinary Core callback; не Cmain/assignment и не private DTO fixture.
import { strict as assert } from "node:assert";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const repo = dirname(dirname(fileURLToPath(import.meta.url)));
async function copy(source: string, target: string) {
  const st = await Deno.lstat(source);
  assert(!st.isSymlink);
  if (st.isDirectory) {
    await Deno.mkdir(target, { recursive: true });
    for await (const child of Deno.readDir(source))
      await copy(join(required(source), child.name), join(target, child.name));
  } else {
    assert(st.isFile);
    await Deno.copyFile(source, target);
    if (st.mode !== null) await Deno.chmod(target, st.mode & 0o777);
  }
}
export async function runPublicationCases(coreSource: string) {
  const output = Deno.env.get("PUBLICATION_TEST_OUTPUT");
  const parent = output
    ? resolve(output)
    : await Deno.makeTempDir({ prefix: "pl-publication-" });
  await Deno.mkdir(parent, { recursive: true });
  const checks: unknown[] = [];
  try {
    for (const variant of ["missing-visible", "missing-hidden", "valid"]) {
      const root = await Deno.makeTempDir({
        dir: parent,
        prefix: variant + "-",
      });
      for (const [source, name] of [
        [coreSource, "course-core"],
        [repo, "course-prairielearn"],
      ]) {
        await copy(
          join(required(source), "_extensions", required(name)),
          join(root, "_extensions", required(name)),
        );
      }
      const put = async (path: string, text: string) => {
        await Deno.mkdir(dirname(join(root, path)), { recursive: true });
        await Deno.writeTextFile(join(root, path), text);
      };
      await put("project/starter.txt", "STARTER_PUBLIC\n");
      await put("common/visible.txt", "COMMON_VISIBLE\n");
      await put("common/hidden.txt", "COMMON_HIDDEN\n");
      await put(
        "_quarto.yml",
        `project:
  type: website
  output-dir: _site
  render: [question.qmd, work.qmd]
  pre-render: [quarto run _extensions/course-core/entrypoints/native-pre.ts]
  post-render: [quarto run _extensions/course-core/entrypoints/native-post.ts]
format: {html: {theme: none}}
filters: [course-core]
course: {id: ordinary-publication, view: student, adapters: [prairielearn]}
course-core-runtime: native-ts
course-core-projection: student
exercise-bank: true
default-exercise-difficulty: introductory
default-exercise-time: 5
default-exercise-course-role: false
default-exercise-target: prairielearn
default-exercise-statement-visibility: open
prairielearn:
  question-defaults: {topic: Test, single-variant: true, grading: {method: manual}, submission: {mode: upload}}
  assessment-defaults: {assignment: {mode: assessment-id}}
`,
      );
      await put("_quarto-student.yml", "course-core-projection: student\n");
      await put(
        "question.qmd",
        `---
project-materialization:
  projects:
    exr-visible:
      common-files: [{source: ${variant === "missing-visible" ? "/missing-visible.txt" : "/common/visible.txt"}, target: student/visible.txt, audience: student}]
    exr-hidden:
      common-files: [{source: ${variant === "missing-hidden" ? "/missing-hidden.txt" : "/common/hidden.txt"}, target: grading/hidden.txt, audience: grading}]
---
# Вопросы

::: {#exr-visible project=/project prairielearn-grading=manual}
## Видимая задача
Открытое условие.
:::

::: {#exr-hidden statement-visibility=restricted project=/project prairielearn-grading=manual}
## Скрытая задача
PRIVATE_STATEMENT
:::

`,
      );
      await put(
        "work.qmd",
        "---\nassessment:\n  id: sec-work\n  kind: lab\n  prairielearn:\n    pass: {at-least: 1}\n    attempts: 1\n    auto-points: 0\n    manual-points: 10\n---\n# Работа {#sec-work}\n\n::: {.task-items requirement=required}\n- @exr-visible\n:::\n",
      );
      const render = await new Deno.Command(
        Deno.env.get("QUARTO") || "quarto",
        {
          args: ["render", "--to", "html", "--profile", "student"],
          cwd: root,
          stdout: "piped",
          stderr: "piped",
        },
      ).output();
      await Deno.writeFile(
        join(parent, variant + "-render.stdout"),
        render.stdout,
      );
      await Deno.writeFile(
        join(parent, variant + "-render.stderr"),
        render.stderr,
      );
      assert(render.success, new TextDecoder().decode(render.stderr));
      assert(
        !(await Deno.readTextFile(join(root, "_site/question.html"))).includes(
          "PRIVATE_STATEMENT",
        ),
      );
      const Core: typeof import("course-core/public.ts") = await import(
        pathToFileURL(join(root, "_extensions/course-core/public.ts")).href
      );
      const PL: typeof import("../_extensions/course-prairielearn/public.ts") =
        await import(
          pathToFileURL(join(root, "_extensions/course-prairielearn/public.ts"))
            .href
        );
      const expected = {
        root,
        projection: "student" as const,
        profiles: ["student"],
        outputDirectory: join(root, "_site"),
      };
      const request = { expectedSources: ["question.qmd", "work.qmd"] };
      const inspect = () =>
        Core.withNativePublication(
          expected,
          request,
          (publication: import("course-core/public.ts").NativePublication) =>
            PL.inspectPublication(publication),
        );
      if (variant.startsWith("missing-")) {
        await assert.rejects(inspect, /RELEASE.SOURCE_POLICY/);
        checks.push({ variant, missingCommonRefusedBeforeProjection: true });
        continue;
      }
      const data = await inspect();
      assert.equal(data.documents.length, 2);
      await assert.rejects(
        () =>
          Core.withCurrentNativeOperation(expected, (op) =>
            op.validateRelease(request, [
              PL.createNativeAdapter({ root, core: Core }),
            ]),
          ),
        /PL.ASSESSMENT_UNQUALIFIED/,
      );
      await assert.rejects(
        () =>
          Core.withNativePublication(
            expected,
            { expectedSources: ["question.qmd"] },
            (publication: import("course-core/public.ts").NativePublication) =>
              PL.inspectPublication(publication),
          ),
        /RELEASE.COVERAGE/,
      );
      await assert.rejects(
        () =>
          Core.withCurrentNativeOperation(
            { ...expected, profiles: ["foreign"] },
            async () => {},
          ),
        /OPERATION_BINDING/,
      );
      checks.push({ variant, genuineOrdinaryPublication: true });
    }
    console.log(
      JSON.stringify(
        {
          status: "PASS_GENUINE_ORDINARY_PUBLICATION",
          checks,
          limit: "No Cmain/assignment/P; ordinary public operation only",
        },
        null,
        2,
      ),
    );
  } finally {
    if (!output) await Deno.remove(parent, { recursive: true });
  }
}
if (import.meta.main)
  await runPublicationCases(resolve(required(Deno.args[0])));
