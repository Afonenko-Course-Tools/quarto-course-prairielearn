import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { inspectPublication } from "../application/native-publication.ts";
const args = Deno.args[0] === "--" ? Deno.args.slice(1) : Deno.args;
const [ownerArg, ...options] = args, flags: Record<string, string> = {};
for (let i = 0; i < options.length; i += 2) {
  const option = options[i], value = options[i + 1];
  if (option === undefined || !["--projection", "--profiles", "--output-directory", "--output"].includes(option) ||
      !value || flags[option]) throw Error("PL unknown/duplicate publication option");
  flags[option] = value;
}
const projection = flags["--projection"];
if (!ownerArg || !flags["--output-directory"] || (projection !== "student" && projection !== "author")) {
  throw Error("Usage: inspect-publication.ts OWNER --projection student|author --output-directory PATH [--profiles student,other] [--output PATH]");
}
const owner = await Deno.realPath(ownerArg);
let core: string | undefined;
for (
  const path of [
    join(owner, "_extensions/course-core"),
    join(owner, "_extensions/Afonenko-Course-Tools/course-core"),
  ]
) {
  try {
    const stat = await Deno.lstat(path);
    if (
      stat.isDirectory && !stat.isSymlink && await Deno.realPath(path) === path
    ) {
      core = path;
      break;
    }
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
  }
}
if (!core) throw Error("PL.INPUT_INVALID: installed public Core required");
const Core: typeof import("course-core/public.ts") = await import(pathToFileURL(join(core, "public.ts")).href);
const output = await Core.withNativePublication({
  root: owner,
  projection,
  profiles: flags["--profiles"] ? flags["--profiles"].split(",") : [],
  outputDirectory: resolve(owner, flags["--output-directory"]),
}, undefined, async (publication) => {
  const inspected = await inspectPublication(publication);
  return {
    course: inspected.course,
    documents: inspected.documents.map(({source, format, assessment, business}) => ({
      source, format, assessment, policy: business.assessment,
      questions: Object.entries(business.questions).map(([id, question]) => ({id, ...question})),
    })),
  };
});
const text = JSON.stringify(output, null, 2) + "\n";
if (flags["--output"]) await Deno.writeTextFile(flags["--output"], text);
else console.log(text.trimEnd());
