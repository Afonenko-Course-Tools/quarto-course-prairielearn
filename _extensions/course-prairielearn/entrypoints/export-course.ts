import { isAbsolute } from "node:path";
import { nativeEntry } from "../application/native-entry.ts";
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
      "--staging-receipt",
      "--publication-conditions",
    ].includes(options[i]) || !options[i + 1] || flags[options[i]]
  ) throw new Error("PL unknown or duplicate CLI option");
  flags[options[i]] = options[i + 1];
}
const publicationEnvironment = Deno.env.get(
  "PRAIRIELEARN_PUBLICATION_CONDITIONS",
);
if (
  flags["--publication-conditions"] !== undefined &&
  publicationEnvironment !== undefined
) throw Error("PL ambiguous publication conditions input: CLI and ENV");
const publicationConditions = flags["--publication-conditions"] ??
  publicationEnvironment;
if (publicationConditions !== undefined && !isAbsolute(publicationConditions)) {
  throw Error("PL publication conditions absolute path required");
}
if (!rootArg || !output || !flags["--instance"] || !flags["--checks-output"]) {
  throw new Error(
    "Usage: export-course.ts COURSE_ROOT NATIVE --instance KEY --checks-output PATH [--runtime-registry PATH] [--book tasks]",
  );
}
await nativeEntry({
  root: rootArg,
  book: flags["--book"] ?? "tasks",
  instance: flags["--instance"],
  output,
  checksOutput: flags["--checks-output"],
  runtimeRegistry: flags["--runtime-registry"],
  candidateImage: flags["--candidate-image"],
  stagingReceipt: flags["--staging-receipt"],
  publicationConditions: publicationConditions,
});
