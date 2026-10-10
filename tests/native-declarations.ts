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
  const book = join(root, "tasks"),
    config = join(book, "_quarto.yml"),
    original = await Deno.readTextFile(config);
  const base = original.replace(
    "  assessment-defaults:\n    question-points: 1\n",
    "",
  );
  await Deno.writeTextFile(config, "metadata-files: [_grading.yaml]\n" + base);
  await Deno.writeTextFile(
    join(book, "_grading.yaml"),
    `prairielearn:
  assessment-defaults:
    attempts: 3
    pass: {at-least: 1}
    question-points: 7
    question-max-points: 9
    max-points: 20
    grade-rate-minutes: 0.5
    advance-score-perc: 40
    allow-multiple-instances: false
`,
  );
  const lab = join(book, "lab.qmd"), authored = await Deno.readTextFile(lab);
  const inheritedDoc = authored.replace(
    "    attempts: 3\n    pass:\n      at-least: 1\n",
    "",
  );
  await Deno.writeTextFile(lab, inheritedDoc);
  await command(["add", core, "--no-prompt"], book);
  await command(["add", repository, "--no-prompt"], book);
  const { collectNativeModel } = await import(
    pathToFileURL(join(book, "_extensions/course-core/body-export/collect.ts"))
      .href
  );
  const { gradingPolicy } = await import(
    pathToFileURL(
      join(
        repository,
        "_extensions/course-prairielearn/application/grading-policy.ts",
      ),
    ).href
  );
  const collect = async () =>
    (await collectNativeModel(root, { book: "tasks" })).result.model
      .assessments[0];
  const inherited = await collect(), policy = inherited.extensions.prairielearn;
  if (
    policy.attempts !== 3 || policy.pass["at-least"] !== 1 ||
    policy["question-points"] !== 7 || policy["grade-rate-minutes"] !== 0.5 ||
    policy["allow-multiple-instances"] !== false
  ) throw Error("native YAML-file numeric/boolean defaults lost");
  const mapped = gradingPolicy(inherited);
  if (
    mapped.questions["exr-add"].points !== 7 ||
    mapped.questions["exr-add"].maxPoints !== 9 ||
    mapped.assessment.maxPoints !== 20
  ) throw Error("metadata native mappings changed");
  // Quarto metadata-files takes precedence over the book config at this scope.
  await Deno.writeTextFile(
    config,
    "metadata-files: [_grading.yaml]\n" +
      base.replace(
        "prairielearn:\n",
        "prairielearn:\n  assessment-defaults:\n    question-points: 6\n",
      ),
  );
  const directory = await collect();
  if (directory.extensions.prairielearn["question-points"] !== 7) {
    throw Error("native included YAML/book-config precedence changed");
  }
  await Deno.writeTextFile(
    lab,
    inheritedDoc.replace("  kind: lab", "  kind: test").replace(
      "#exr-add project=",
      '#exr-add statement-visibility="restricted" project=',
    ).replace(
      "  prairielearn:\n",
      `  prairielearn:
    attempts: 4
    question-points: [5, 2]
    question-max-points: null
    allow-multiple-instances: true
    question-overrides:
      exr-add:
        question-points: [3, 1]
        attempts: 2
`,
    ),
  );
  const local = await collect(), native = gradingPolicy(local);
  if (
    local.extensions.prairielearn.attempts !== 4 ||
    local.extensions.prairielearn["question-max-points"] !== null ||
    JSON.stringify(local.extensions.prairielearn["question-points"]) !==
      "[5,2]" ||
    JSON.stringify(native.questions["exr-add"].points) !== "[3,1]" ||
    native.questions["exr-add"].triesPerVariant !== 2 ||
    Object.hasOwn(native.questions["exr-add"], "maxPoints") ||
    native.assessment.multipleInstance !== true
  ) throw Error("document numeric/list/null/boolean overrides lost");
  await Deno.writeTextFile(
    join(book, "_grading.yaml"),
    (await Deno.readTextFile(join(book, "_grading.yaml"))).replace(
      "    question-points: 7",
      "    question-points: [9, 7, 5]\n    question-overrides:\n      exr-add:\n        question-points: [10, 6, 2]",
    ),
  );
  await Deno.writeTextFile(
    lab,
    (await Deno.readTextFile(lab)).replace("[5, 2]", "[8, 4]").replace(
      "[3, 1]",
      "[8, 4]",
    ),
  );
  const shortened = await collect(), shortNative = gradingPolicy(shortened);
  if (
    JSON.stringify(shortened.extensions.prairielearn["question-points"]) !==
      "[8,4]" ||
    JSON.stringify(shortNative.questions["exr-add"].points) !== "[8,4]"
  ) {
    throw Error(
      "shorter inherited question-points lists retained trailing entries",
    );
  }
  await command([
    "run",
    join(
      book,
      "_extensions/course-prairielearn/entrypoints/inspect-grading.ts",
    ),
    root,
    "--instance",
    "pilot",
    "--output",
    join(root, "effective.json"),
  ], book);
  const report = JSON.parse(
    await Deno.readTextFile(join(root, "effective.json")),
  );
  if (
    JSON.stringify(report.works[0].native.questions["exr-add"].points) !==
      "[8,4]" || report.works[0].effectivePolicy["question-max-points"] !== null
  ) throw Error("installed effective inspection differs from collected model");
  await Deno.writeTextFile(config, "metadata-files: [_grading.yaml]\n" + base);
  for (
    const [field, bad] of [
      ["attempts", "[3]"],
      ["attempts", "{unexpected: 3}"],
      ["question-points", "{unexpected: 3}"],
      ["question-max-points", "[3]"],
      ["allow-multiple-instances", "[true]"],
      ["grade-rate-minutes", "false"],
    ]
  ) {
    await Deno.writeTextFile(
      lab,
      inheritedDoc.replace(
        "  prairielearn:\n",
        "  prairielearn:\n    " + field + ": " + bad + "\n",
      ),
    );
    let rejected = false;
    try {
      await collect();
    } catch (e) {
      rejected = String(e).includes(field);
    }
    if (!rejected) {
      throw Error(
        "invalid document metadata scalar accepted " + field + ": " + bad,
      );
    }
  }
  console.log(
    "installed course/YAML-file/directory/document metadata: numeric/list/null/retry overrides preserved; invalid scalar types rejected",
  );
} finally {
  await Deno.remove(root, { recursive: true });
}
