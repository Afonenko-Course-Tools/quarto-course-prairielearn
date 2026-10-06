import { join } from "node:path";
import { pathToFileURL } from "node:url";
const root = Deno.cwd();
async function extension(name: string) {
  for (const owner of ["", "Afonenko-Course-Tools/"]) {
    const path = join(root, "bank/_extensions", owner + name);
    try {
      if ((await Deno.stat(path)).isDirectory) return path;
    } catch (e) {
      if (!(e instanceof Deno.errors.NotFound)) throw e;
    }
  }
  throw Error("Install " + name + " in bank");
}
const home = await Deno.makeTempDir({ prefix: "gradle-java-" });
try {
  for (
    const [solution, success] of [["../reference", true], [
      "../student",
      false,
    ]] as const
  ) {
    const checked = await new Deno.Command("gradle", {
      args: ["--offline", "--no-daemon", "-Psolution=" + solution, "test"],
      cwd: join(root, "bank/projects/clamp/tests"),
      env: { GRADLE_USER_HOME: home },
      stdout: "inherit",
      stderr: "inherit",
    }).output();
    if (checked.success !== success) {
      throw Error("Gradle result disagrees for " + solution);
    }
  }
} finally {
  await Deno.remove(home, { recursive: true });
}
const core = await extension("course-core"),
  adapter = await extension("course-prairielearn");
const { collectExport } = await import(
  pathToFileURL(join(core, "body-export/collect.ts")).href
);
const { buildBodies } = await import(
  pathToFileURL(join(core, "body-export/producer.ts")).href
);
const { exportPrairieLearn } = await import(
  pathToFileURL(join(adapter, "application/export.ts")).href
);
await Deno.mkdir(join(root, "artifacts"), { recursive: true });
const bindings = JSON.parse(await Deno.readTextFile("binding.json"));
for (const variant of ["a", "b"]) {
  const selected = await collectExport(root, {
    book: "bank",
    work: "sec-variant-" + variant,
  });
  const bodies = await buildBodies(selected.result, {
    projectRoot: selected.projectRoot,
    courseId: selected.courseId,
    work: selected.work,
    includeClosed: true,
  });
  const projects = Object.fromEntries(
    selected.result.model.exercises.map((
      e: { id: string; project: string },
    ) => [e.id, e.project]),
  );
  const questions = Object.fromEntries(
    bodies.publicPackage.questions.map((
      q: { id: string },
    ) => [q.id, bindings.questions[q.id]]),
  );
  await exportPrairieLearn(
    bodies.publicPackage,
    { projectRoot: selected.projectRoot, projects },
    { questions },
    join(root, "artifacts/variant-" + variant),
  );
}
const html = await new Deno.Command("quarto", {
  args: ["render", "--fail-if-warnings"],
  stdout: "inherit",
  stderr: "inherit",
}).output();
if (!html.success) Deno.exit(html.code);

const revision = await new Deno.Command("git", {
  args: ["rev-parse", "HEAD"],
  stdout: "piped",
  stderr: "null",
}).output();
await Deno.writeTextFile(
  "_site/BUILD.json",
  JSON.stringify(
    {
      sourceRepository: "Afonenko-Course-Tools/quarto-course-prairielearn",
      commit: Deno.env.get("DEMO_SOURCE_COMMIT") ||
        (revision.success
          ? new TextDecoder().decode(revision.stdout).trim()
          : ""),
      sourceDirty: Deno.env.get("DEMO_SOURCE_DIRTY") === "true",
      extensionVersion: "2.1.0",
      dependencies: { "quarto-course": "3.0.0" },
      projection: "full",
      verification: "local installed native build",
      livePlatformVerified: false,
    },
    null,
    2,
  ) + "\n",
);
