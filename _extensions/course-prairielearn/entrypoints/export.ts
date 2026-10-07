import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { exportPrairieLearn } from "../application/export.ts";
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
  if (!core) {
    throw diagnostic(
      "PL.INPUT_INVALID",
      "В выбранной книге требуется установленный Core",
      {
        source: join(root, book),
        id: work,
        field: "book",
        hint:
          "Установите совместимый Core в выбранную книгу командой quarto add",
      },
    );
  }
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
  let binding: any;
  try {
    binding = JSON.parse(await Deno.readTextFile(bindingPath));
  } catch (cause) {
    if (
      !(cause instanceof SyntaxError) &&
      !(cause instanceof Deno.errors.NotFound)
    ) throw cause;
    throw diagnostic(
      "PL.INPUT_INVALID",
      "Не удалось прочитать JSON-привязку вопросов",
      {
        source: bindingPath,
        id: work,
        field: "binding",
        hint: "Укажите существующий JSON-файл привязок",
      },
      cause,
    );
  }
  if (
    !binding || !binding.questions || typeof binding.questions !== "object" ||
    Array.isArray(binding.questions)
  ) {
    throw diagnostic("ADAPTER", "В привязке требуется карта questions", {
      source: bindingPath,
      id: work,
      field: "questions",
      hint: "Задайте явную привязку выбранных вопросов",
    });
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
