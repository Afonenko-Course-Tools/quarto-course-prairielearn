import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const repository = dirname(dirname(fileURLToPath(import.meta.url))),
  core = resolve(Deno.args[0] ?? "../quarto-course");
const root = await Deno.makeTempDir({ prefix: "pl-numeric-inheritance-" });
async function copy(src: string, out: string) {
  await Deno.mkdir(out, { recursive: true });
  for await (const e of Deno.readDir(src)) {
    if (["_extensions", "_generated", ".quarto"].includes(e.name)) continue;
    const a = join(src, e.name), b = join(out, e.name);
    if (e.isDirectory) await copy(a, b);
    else if (e.isFile) await Deno.copyFile(a, b);
  }
}
async function command(args: string[], cwd: string) {
  const result = await new Deno.Command(Deno.env.get("QUARTO") ?? "quarto", {
    args,
    cwd,
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!result.success) {
    throw new Error(
      new TextDecoder().decode(result.stdout) +
        new TextDecoder().decode(result.stderr),
    );
  }
}
try {
  await copy(join(repository, "examples/native-course"), root);
  const book = join(root, "tasks"), config = join(book, "_quarto.yml");
  const original = await Deno.readTextFile(config);
  await Deno.writeTextFile(
    config,
    original.replace(
      "prairielearn:\n",
      "prairielearn:\n  assessment-defaults:\n    attempts: 3\n    pass:\n      at-least: 1\n",
    ),
  );
  const lab = join(book, "lab.qmd"), authored = await Deno.readTextFile(lab);
  await Deno.writeTextFile(
    lab,
    authored.replace("    attempts: 3\n    pass:\n      at-least: 1\n", ""),
  );
  await command(["add", core, "--no-prompt"], book);
  await command(["add", repository, "--no-prompt"], book);
  const { collectNativeModel } = await import(
    pathToFileURL(join(book, "_extensions/course-core/body-export/collect.ts"))
      .href
  );
  const inherited = await collectNativeModel(root, { book: "tasks" });
  const policy = inherited.result.model.assessments[0].extensions.prairielearn;
  if (policy.attempts !== 3 || policy.pass["at-least"] !== 1) {
    throw new Error("native numeric inherited policy not normalized");
  }
  await Deno.writeTextFile(lab, authored.replace("attempts: 3", "attempts: 4"));
  const local = await collectNativeModel(root, { book: "tasks" });
  if (
    local.result.model.assessments[0].extensions.prairielearn.attempts !== 4
  ) throw new Error("document numeric override lost");
  for (const bad of ["[3]", "{unexpected: 3}"]) {
    await Deno.writeTextFile(
      config,
      original.replace(
        "prairielearn:\n",
        "prairielearn:\n  assessment-defaults:\n    attempts: " + bad + "\n",
      ),
    );
    let rejected = false;
    try {
      await collectNativeModel(root, { book: "tasks" });
    } catch (e) {
      rejected = String(e).includes("attempts");
    }
    if (!rejected) {
      throw new Error("non-scalar numeric metadata accepted: " + bad);
    }
  }
  console.log(
    "installed native metadata: inherited/document numerics normalized; list/map scalars rejected",
  );
} finally {
  await Deno.remove(root, { recursive: true });
}
