import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { exportCourse } from "../application/export-course.ts";
import { declarations } from "../application/declarations.ts";
const args = Deno.args[0] === "--" ? Deno.args.slice(1) : Deno.args;
const [rootArg, output, ...options] = args;
const flags: Record<string, string> = {};
for (let i = 0; i < options.length; i += 2) {
  if (
    ![
      "--instance",
      "--checks-output",
      "--runtime-registry",
      "--book",
      "--candidate-image",
    ].includes(options[i]) || !options[i + 1] || flags[options[i]]
  ) throw new Error("PL unknown or duplicate CLI option");
  flags[options[i]] = options[i + 1];
}
if (!rootArg || !output || !flags["--instance"] || !flags["--checks-output"]) {
  throw new Error(
    "Usage: export-course.ts COURSE_ROOT NATIVE --instance KEY --checks-output PATH [--runtime-registry PATH] [--book tasks]",
  );
}
const root = await Deno.realPath(rootArg), book = flags["--book"] ?? "tasks";
const registryPath = flags["--runtime-registry"] ??
  Deno.env.get("PRAIRIELEARN_RUNTIME_REGISTRY") ??
  join(root, "prairielearn/runtime-profiles.json");
if (flags["--candidate-image"]) {
  const found = await new Deno.Command("docker", {
    args: [
      "image",
      "inspect",
      flags["--candidate-image"],
      "--format",
      "{{.Id}}",
    ],
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (
    !found.success ||
    new TextDecoder().decode(found.stdout).trim() !== flags["--candidate-image"]
  ) throw new Error("PL candidate must be an actual locally built image ID");
}
const inspected = await new Deno.Command(Deno.env.get("QUARTO") ?? "quarto", {
  args: ["inspect", resolve(root, book)],
  stdout: "piped",
  stderr: "piped",
}).output();
if (!inspected.success) {
  throw new Error(new TextDecoder().decode(inspected.stderr));
}
const config =
  JSON.parse(new TextDecoder().decode(inspected.stdout)).config.prairielearn;
const delivery = declarations(config, flags["--instance"]);
if (delivery.book !== book) throw new Error("PL delivery book mismatch");
let core: string | undefined;
for (
  const path of [
    join(root, book, "_extensions/course-core"),
    join(root, book, "_extensions/Afonenko-Course-Tools/course-core"),
  ]
) {
  try {
    if ((await Deno.stat(path)).isDirectory) {
      core = path;
      break;
    }
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
  }
}
if (!core) throw new Error("PL installed Core required");
const { collectNativeModel } = await import(
  pathToFileURL(join(core, "body-export/collect.ts")).href
);
const { collectProjectChecks } = await import(
  pathToFileURL(join(core, "project-checks/collect.ts")).href
);
const { buildBodies } = await import(
  pathToFileURL(join(core, "body-export/producer.ts")).href
);
const collected = await collectNativeModel(root, { book });
const checks = await collectProjectChecks(root, { book }, collected);
await exportCourse({
  courseId: collected.courseId,
  projectRoot: collected.projectRoot,
  result: collected.result,
  checks,
  config,
  registry: JSON.parse(await Deno.readTextFile(registryPath)),
  instance: flags["--instance"],
  output,
  checksOutput: flags["--checks-output"],
  candidateImage: flags["--candidate-image"],
  body: async (work: string) =>
    (await buildBodies(collected.result, {
      projectRoot: collected.projectRoot,
      courseId: collected.courseId,
      work,
      includeClosed: true,
    })).publicPackage,
});
