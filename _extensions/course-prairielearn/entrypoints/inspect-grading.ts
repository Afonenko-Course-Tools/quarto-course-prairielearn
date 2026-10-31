import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { readNativeAdapterExpectation } from "../application/native-adapter.ts";
import { inspectPublication } from "../application/native-publication.ts";
import { declarations } from "../application/declarations.ts";
import { gradingPolicy } from "../application/grading-policy.ts";
const args = Deno.args[0] === "--" ? Deno.args.slice(1) : Deno.args;
const [rootArg, ...options] = args, flags: Record<string, string> = {};
for (let i = 0; i < options.length; i += 2) {
  if (
    !["--instance", "--book", "--output"].includes(options[i]) ||
    !options[i + 1] || flags[options[i]]
  ) {
    throw Error("PL unknown/duplicate inspect option");
  }
  flags[options[i]] = options[i + 1];
}
if (!rootArg || !flags["--instance"]) {
  throw Error(
    "Usage: inspect-grading.ts COURSE_ROOT --instance KEY [--book tasks] [--output PATH]",
  );
}
const owner = await Deno.realPath(
  join(await Deno.realPath(rootArg), flags["--book"] ?? "tasks"),
);
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
const Core = await import(pathToFileURL(join(core, "public.ts")).href);
const candidate = await readNativeAdapterExpectation(Core, owner);
const output = await Core.withCurrentNativeOperation(
  candidate.expectation,
  async (operation: any) => {
    const inspected = await inspectPublication(Core, operation, {
      expectedSources: candidate.expectedSources,
    });
    const configs = inspected.documents.map((doc: any) =>
      doc.business.raw.config
    ).filter(Boolean);
    const configured = configs.map((config: unknown) =>
      declarations(config, flags["--instance"])
    );
    if (
      !configured.length ||
      configured.some((d: any) => d.book !== (flags["--book"] ?? "tasks"))
    ) throw Error("PL.INPUT_INVALID: delivery book");
    const selected = configured[0].instance.works;
    if (
      configured.some((d: any) =>
        JSON.stringify(d.instance.works) !== JSON.stringify(selected)
      )
    ) throw Error("PL.INPUT_INVALID: conflicting delivery declarations");
    const works = selected.map((id: string) => {
      const docs = inspected.documents.filter((doc: any) =>
        doc.assessment?.id === id
      );
      if (docs.length !== 1) {
        throw Error("PL selected work missing/ambiguous " + id);
      }
      const { source, assessment, business } = docs[0],
        policy = business.assessment;
      return {
        id,
        source,
        kind: assessment.kind,
        effectivePolicy: policy,
        native: gradingPolicy({
          ...assessment,
          source,
          extensions: { prairielearn: policy },
        }),
      };
    });
    await operation.assertCurrent();
    return {
      schemaVersion: 1,
      courseId: inspected.course.id,
      instance: flags["--instance"],
      works,
      questions: inspected.documents.flatMap(({ source, business }: any) =>
        Object.entries(business.questions).map(([id, q]: [string, any]) => ({
          id,
          source,
          ...(Object.hasOwn(q, "singleVariant")
            ? { singleVariant: q.singleVariant }
            : {}),
        }))
      ),
      nativeOptionalFields:
        "Отсутствующие/null ceilings и необязательные repeat controls не получают внутренних defaults.",
    };
  },
);
const text = JSON.stringify(output, null, 2) + "\n";
if (flags["--output"]) await Deno.writeTextFile(flags["--output"], text);
else console.log(text.trimEnd());
