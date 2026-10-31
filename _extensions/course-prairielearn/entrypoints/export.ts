import { nativeEntry } from "../application/native-entry.ts";
import { diagnostic } from "../application/diagnostics.ts";
async function main() {
  const args = Deno.args[0] === "--" ? Deno.args.slice(1) : Deno.args;
  const [root, book, work, bindingPath, output, ...explicitProfiles] = args;
  const profiles = explicitProfiles.length
    ? explicitProfiles
    : (Deno.env.get("QUARTO_PROFILE") || "").split(",").filter((p) =>
      p && p !== "student" && p !== "full"
    );
  if (!root || !book || !work || !bindingPath || !output) {
    throw diagnostic(
      "PL.INPUT_INVALID",
      "Недостаточно аргументов для экспорта",
      {
        field: "arguments",
        hint:
          "Запуск: export.ts COURSE_ROOT BOOK WORK BINDING OUTPUT [FUNCTIONAL_PROFILE...]",
      },
    );
  }
  await nativeEntry({ root, book, work, bindingPath, output, profiles });
}
try {
  await main();
} catch (error) {
  if (
    !(error instanceof Error) ||
    !["ExtensionDiagnostic", "ExternalToolFailure"].includes(error.name)
  ) throw error;
  let cause: unknown = error;
  let shown = "";
  const seen = new Set<Error>();
  while (cause instanceof Error && !seen.has(cause)) {
    seen.add(cause);
    const message =
      ["ExtensionDiagnostic", "ExternalToolFailure"].includes(cause.name)
        ? cause.message
        : cause.stack || cause.message;
    if (!shown.includes(message)) {
      console.error(message);
      shown += "\n" + message;
    }
    cause = cause.cause;
  }
  Deno.exit(1);
}
