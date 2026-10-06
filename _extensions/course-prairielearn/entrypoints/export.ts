import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { exportPrairieLearn } from "../application/export.ts";
const args = Deno.args[0] === "--" ? Deno.args.slice(1) : Deno.args;
const [root, book, work, bindingPath, output, ...explicitProfiles] = args;
const profiles = explicitProfiles.length
  ? explicitProfiles
  : (Deno.env.get("QUARTO_PROFILE") || "").split(",").filter((p) =>
    p && p !== "student" && p !== "full"
  );
if (!root || !book || !work || !bindingPath || !output) {
  throw Error(
    "usage: export.ts COURSE_ROOT BOOK WORK BINDING OUTPUT [FUNCTIONAL_PROFILE...]",
  );
}
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
if (!core) throw Error("Installed Core required in selected bank");
const { collectExport } = await import(
  pathToFileURL(join(core, "body-export/collect.ts")).href
);
const { buildBodies } = await import(
  pathToFileURL(join(core, "body-export/producer.ts")).href
);
const selected = await collectExport(root, { book, work, profiles });
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
const binding = JSON.parse(await Deno.readTextFile(bindingPath));
if (
  !binding || !binding.questions || typeof binding.questions !== "object" ||
  Array.isArray(binding.questions)
) {
  throw Error("ADAPTER: questions binding map required");
}
const selectedBinding = {
  ...binding,
  questions: Object.fromEntries(
    bodies.publicPackage.questions.map((
      q: { id: string },
    ) => [q.id, binding.questions[q.id]]),
  ),
};
await exportPrairieLearn(
  bodies.publicPackage,
  { projectRoot: selected.projectRoot, projects },
  selectedBinding,
  output,
);
