import { nativeEntry } from "../application/native-entry.ts";
const args = Deno.args[0] === "--" ? Deno.args.slice(1) : Deno.args;
const [rootArg, output, ...options] = args;
const flags: Record<string, string> = {};
for (let i = 0; i < options.length; i += 2) {
  const option = options[i], value = options[i + 1];
  if (
    option === undefined || ![
      "--instance",
      "--checks-output",
      "--runtime-registry",
      "--book",
      "--candidate-image",
    ].includes(option) || !value || flags[option]
  ) throw new Error("PL unknown or duplicate CLI option");
  flags[option] = value;
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
  ...(flags["--runtime-registry"] === undefined ? {} : { runtimeRegistry: flags["--runtime-registry"] }),
  ...(flags["--candidate-image"] === undefined ? {} : { candidateImage: flags["--candidate-image"] }),
});
