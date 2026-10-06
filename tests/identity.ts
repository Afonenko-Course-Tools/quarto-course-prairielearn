import { join } from "node:path";
import { pathToFileURL } from "node:url";
const coreArgument = Deno.args[0];
if (!coreArgument) throw Error("usage: identity.ts CORE");
const core = await Deno.realPath(coreArgument);
const repo = Deno.cwd(),
  root = await Deno.makeTempDir({ prefix: "pl-root-identity-" }),
  bank = join(root, "bank");
async function command(args: string[], cwd = bank) {
  const result = await new Deno.Command(Deno.env.get("QUARTO") || "quarto", {
    args,
    cwd,
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!result.success) {
    throw Error(
      new TextDecoder().decode(result.stderr) +
        new TextDecoder().decode(result.stdout),
    );
  }
}
try {
  await Deno.mkdir(bank);
  await Deno.mkdir(join(bank, "projects/program"), { recursive: true });
  await Deno.writeTextFile(
    join(root, "_quarto.yml"),
    "project:\n  type: website\n  render: [index.qmd]\ncourse:\n  id: logical-root\n",
  );
  await Deno.writeTextFile(join(root, "index.qmd"), "# Course\n");
  await Deno.writeTextFile(
    join(bank, "_quarto.yml"),
    "project:\n  type: book\n  pre-render: _extensions/course-core/entrypoints/pre.ts\n  post-render: _extensions/course-core/entrypoints/post.ts\nbook:\n  chapters: [index.qmd, tasks.qmd, work.qmd]\nfilters: [course-core, course-prairielearn]\nformat: html\ncourse:\n  adapters: [prairielearn]\nprofile:\n  default: full\n  group: [[student, full]]\n",
  );
  await Deno.writeTextFile(
    join(bank, "_quarto-full.yml"),
    "project:\n  output-dir: _book/full\ncourse:\n  view: full\n",
  );
  await Deno.writeTextFile(join(bank, "index.qmd"), "# Bank\n");
  await Deno.writeTextFile(
    join(bank, "tasks.qmd"),
    '# Tasks\n\n::: {#exr-program target="prairielearn" project="/projects/program"}\n## Program\n\nNative programming condition.\n:::\n',
  );
  await Deno.writeTextFile(
    join(bank, "work.qmd"),
    "---\nassessment:\n  kind: lab\n  prairielearn:\n    attempts: 1\n    pass: {at-least: 1}\n    assignment: {mode: assessment-id}\n---\n\n# Work {#work-a}\n\n::: {.task-items}\n1. @exr-program\n:::\n",
  );
  await command(["add", core, "--no-prompt"]);
  await command(["add", repo, "--no-prompt"]);
  await command(["render", "--profile", "full", "--fail-if-warnings"]);
  await command([
    "run",
    "_extensions/course-core/entrypoints/check.ts",
    ".",
    "full",
  ]);
  const model = JSON.parse(
    await Deno.readTextFile(join(bank, "_generated/course-spec/course.json")),
  );
  const pending = model.assessments[0].extensions.prairielearn.assignment;
  if (
    pending.mode !== "assessment-id" || pending["student-label"] !== undefined
  ) throw Error("native rendering did not defer root identity");
  const { collectExport } = await import(
    pathToFileURL(join(bank, "_extensions/course-core/body-export/collect.ts"))
      .href
  );
  const selected = await collectExport(root, { book: "bank", work: "work-a" });
  const assignment =
    selected.result.model.assessments[0].extensions.prairielearn.assignment;
  const digest = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-1",
      new TextEncoder().encode("logical-root\0work-a"),
    ),
  );
  const expected = "pl-" +
    Array.from(digest, (x) => x.toString(16).padStart(2, "0")).join("");
  if (
    assignment["student-label"] !== expected || assignment.mode !== undefined
  ) throw Error("root export did not resolve stable platform label");
  console.log(
    "Native nested bank defers identity; explicit root export resolves exact stable PL work label",
  );
} finally {
  if (Deno.env.get("KEEP_IDENTITY_FIXTURE")) {
    console.log("identity fixture:", root);
  } else await Deno.remove(root, { recursive: true });
}
