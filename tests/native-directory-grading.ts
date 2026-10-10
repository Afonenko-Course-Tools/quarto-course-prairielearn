import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const repository = dirname(dirname(fileURLToPath(import.meta.url))),
  core = resolve(Deno.args[0] ?? "../quarto-course");
const root = await Deno.makeTempDir({ prefix: "pl-directory-grading-" });
const assert = (value: unknown, message: string) => {
  if (!value) throw Error(message);
};
async function copy(src: string, out: string) {
  await Deno.mkdir(out, { recursive: true });
  for await (const e of Deno.readDir(src)) {
    if (["_extensions", "_generated", ".quarto"].includes(e.name)) continue;
    const a = join(src, e.name), b = join(out, e.name);
    if (e.isDirectory) await copy(a, b);
    else if (e.isFile) await Deno.copyFile(a, b);
  }
}
async function quarto(args: string[], cwd: string) {
  const r = await new Deno.Command(Deno.env.get("QUARTO") ?? "quarto", {
    args,
    cwd,
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!r.success) {
    throw Error(
      new TextDecoder().decode(r.stdout) + new TextDecoder().decode(r.stderr),
    );
  }
}
try {
  await copy(join(repository, "examples/native-course"), root);
  const book = join(root, "tasks"),
    config = join(book, "_quarto.yml"),
    directory = join(book, "_metadata.yml"),
    lab = join(book, "lab.qmd");
  await Deno.writeTextFile(
    config,
    (await Deno.readTextFile(config)).replace(
      "question-points: 1",
      "question-points: [9, 7, 5]",
    ),
  );
  const local = (points: string) =>
    "prairielearn:\n  assessment-defaults:\n    question-points: " + points +
    "\n";
  await Deno.writeTextFile(directory, local("[4, 2]"));
  await Deno.writeTextFile(
    lab,
    (await Deno.readTextFile(lab)).replace("kind: lab", "kind: test").replace(
      "#exr-add project=",
      '#exr-add statement-visibility="restricted" project=',
    ),
  );
  await quarto(["add", core, "--no-prompt"], book);
  await quarto(["add", repository, "--no-prompt"], book);
  const installed = join(book, "_extensions/course-prairielearn"),
    installedCore = join(book, "_extensions/course-core");
  const { collectNativeModel } = await import(
    pathToFileURL(join(installedCore, "body-export/collect.ts")).href
  );
  const { collectProjectChecks } = await import(
    pathToFileURL(join(installedCore, "project-checks/collect.ts")).href
  );
  const { buildBodies } = await import(
    pathToFileURL(join(installedCore, "body-export/producer.ts")).href
  );
  const { gradingPolicy } = await import(
    pathToFileURL(join(installed, "application/grading-policy.ts")).href
  );
  const { exportCourse } = await import(
    pathToFileURL(join(installed, "application/export-course.ts")).href
  );
  const current = await collectNativeModel(root, { book: "tasks" }),
    work = current.result.model.assessments[0],
    expected = "[9,7,5,4,2]";
  assert(
    JSON.stringify(work.extensions.prairielearn["question-points"]) ===
      expected,
    "Quarto same-key concatenation changed",
  );
  assert(
    JSON.stringify(gradingPolicy(work).questions["exr-add"].points) ===
      expected,
    "adapter changed authored Quarto concatenation",
  );
  await quarto([
    "run",
    join(installed, "entrypoints/inspect-grading.ts"),
    root,
    "--instance",
    "pilot",
    "--output",
    join(root, "effective.json"),
  ], book);
  const report = JSON.parse(
    await Deno.readTextFile(join(root, "effective.json")),
  );
  assert(
    JSON.stringify(report.works[0].native.questions["exr-add"].points) ===
      expected,
    "inspect report changed same-key concatenation",
  );
  const inspected = await new Deno.Command(Deno.env.get("QUARTO") ?? "quarto", {
    args: ["inspect", book],
    stdout: "piped",
  }).output();
  assert(inspected.success, "native metadata inspect failed");
  const checks = await collectProjectChecks(root, { book: "tasks" }, current);
  await exportCourse({
    courseId: current.courseId,
    projectRoot: current.projectRoot,
    result: current.result,
    checks,
    config: JSON.parse(new TextDecoder().decode(inspected.stdout)).config
      .prairielearn,
    registry: {
      schemaVersion: 1,
      profiles: {
        "java25-junit-v1": {
          mode: "implementation",
          image: "test.invalid/private-fixture@sha256:" + "1".repeat(64),
        },
      },
    },
    instance: "pilot",
    output: join(root, "native"),
    checksOutput: join(root, "checks.json"),
    body: async (id: string) =>
      (await buildBodies(current.result, {
        projectRoot: current.projectRoot,
        courseId: current.courseId,
        work: id,
        includeClosed: true,
      })).publicPackage,
  });
  const native = JSON.parse(
    await Deno.readTextFile(
      join(
        root,
        "native/courseInstances/pilot/assessments/sec-add/infoAssessment.json",
      ),
    ),
  );
  assert(
    JSON.stringify(native.zones[0].questions[0].points) === expected,
    "native JSON changed same-key concatenation",
  );
  await Deno.writeTextFile(directory, local("[8, 4]"));
  const increasing = await collectNativeModel(root, { book: "tasks" });
  let message = "";
  try {
    gradingPolicy(increasing.result.model.assessments[0]);
  } catch (e) {
    message = String(e);
  }
  assert(
    message.includes("question-points (exr-add)") &&
      message.includes("nonincreasing") &&
      message.includes("assessment-defaults"),
    "increasing Quarto concatenation did not fail actionable",
  );
  console.log(
    "installed same-key Quarto concatenation preserved [9,7,5,4,2] in model/report/native JSON; increasing [9,7,5,8,4] rejected actionable",
  );
} finally {
  await Deno.remove(root, { recursive: true });
}
