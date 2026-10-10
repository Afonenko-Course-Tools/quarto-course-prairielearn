import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { declarations } from "../application/declarations.ts";
import { gradingPolicy } from "../application/grading-policy.ts";
const args = Deno.args[0] === "--" ? Deno.args.slice(1) : Deno.args;
const [rootArg, ...options] = args, flags: Record<string, string> = {};
for (let i = 0; i < options.length; i += 2) {
  if (
    !["--instance", "--book", "--output"].includes(options[i]) ||
    !options[i + 1] || flags[options[i]]
  ) throw Error("PL unknown/duplicate inspect option");
  flags[options[i]] = options[i + 1];
}
if (!rootArg || !flags["--instance"]) {
  throw Error(
    "Usage: inspect-grading.ts COURSE_ROOT --instance KEY [--book tasks] [--output PATH]",
  );
}
const root = await Deno.realPath(rootArg), book = flags["--book"] ?? "tasks";
const inspected = await new Deno.Command(Deno.env.get("QUARTO") ?? "quarto", {
  args: ["inspect", resolve(root, book)],
  stdout: "piped",
  stderr: "piped",
}).output();
if (!inspected.success) throw Error(new TextDecoder().decode(inspected.stderr));
const d = declarations(
  JSON.parse(new TextDecoder().decode(inspected.stdout)).config.prairielearn,
  flags["--instance"],
);
if (d.book !== book) throw Error("PL delivery book mismatch");
let core: string | undefined;
for (
  const directory of [
    join(root, book, "_extensions/course-core"),
    join(root, book, "_extensions/Afonenko-Course-Tools/course-core"),
  ]
) {
  try {
    if ((await Deno.stat(directory)).isDirectory) {
      core = directory;
      break;
    }
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
  }
}
if (!core) throw Error("PL installed Core required");
const { collectNativeModel } = await import(
  pathToFileURL(join(core, "body-export/collect.ts")).href
);
const model = await collectNativeModel(root, { book });
const works = d.instance.works.map((id: string) => {
  const work = model.result.model.assessments.find((w: any) => w.id === id);
  if (!work) throw Error("PL selected work missing " + id);
  return {
    id,
    source: work.source,
    kind: work.kind,
    effectivePolicy: work.extensions.prairielearn,
    native: gradingPolicy(work),
  };
});
const output = JSON.stringify(
  {
    schemaVersion: 1,
    courseId: model.courseId,
    instance: flags["--instance"],
    works,
    questions: model.result.model.exercises.filter((e: any) =>
      e.target === "prairielearn"
    ).map((e: any) => ({
      id: e.id,
      source: e.source,
      ...(Object.hasOwn(e.extensions?.prairielearn ?? {}, "single-variant")
        ? { singleVariant: e.extensions.prairielearn["single-variant"] }
        : {}),
    })),
    nativeOptionalFields:
      "Absent/null point ceilings and absent optional repeat controls are omitted and delegated to pinned Community; no internal defaults are inserted.",
  },
  null,
  2,
) + "\n";
if (flags["--output"]) {
  await Deno.writeTextFile(resolve(flags["--output"]), output);
} else console.log(output.trimEnd());
