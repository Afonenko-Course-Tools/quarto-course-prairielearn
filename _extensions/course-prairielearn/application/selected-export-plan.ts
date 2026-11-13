import type { PublicBodyPackage } from "course-core/public.ts";
import type { ProjectContext } from "./export-types.ts";
import type { DiagnosticContext } from "./diagnostics.ts";
import { fail, fields, record } from "./export-files.ts";
import { validateSlots } from "./slots.ts";
type Work = PublicBodyPackage["works"][number];
function selectedWork(
  p: PublicBodyPackage,
  work: Work | undefined,
  workContext: DiagnosticContext,
) {
  const refuse = (message: string, field: string): never =>
    fail(message, { ...workContext, field });
  if (!Array.isArray(p.works) || p.works.length !== 1) {
    refuse("Требуется одна работа", "works");
  }
  if (
    !work ||
    !fields(
      work,
      ["owner", "id", "key", "source", "kind", "title", "slots"],
      ["theoryTime", "relatedExercise", "introduction"],
    ) ||
    work.owner !== p.owner ||
    work.key !== p.owner + "/" + work.id ||
    typeof work.id !== "string" ||
    !/^[a-z][a-z0-9-]*$/.test(work.id) ||
    typeof work.source !== "string" ||
    !work.source ||
    typeof work.title !== "string" ||
    !work.title.trim() ||
    !["lab", "seminar", "practical", "test"].includes(work.kind) ||
    (work.relatedExercise !== undefined &&
      (typeof work.relatedExercise !== "string" ||
        !/^exr-[a-z0-9][a-z0-9-]*$/.test(work.relatedExercise))) ||
    (work.theoryTime !== undefined &&
      (typeof work.theoryTime !== "number" ||
        !Number.isFinite(work.theoryTime) ||
        work.theoryTime <= 0))
  )
    return refuse("Неверные поля работы v2", "works");
  try {
    validateSlots(work.slots, p.owner, work.id, true);
  } catch (error) {
    refuse("Неверные позиции Body v2: " + String(error), "works.slots");
  }
  const candidates = work.slots.flatMap((slot) => slot.candidates);
  if (
    candidates.length !== p.questions.length ||
    p.questions.some((q) => !candidates.includes(q?.key))
  )
    refuse("Каталог должен содержать всех кандидатов", "works.slots");
  const assignments = Object.fromEntries<
    PublicBodyPackage["works"][number]["slots"][number]["assignment"]
  >(
    work.slots.flatMap((slot) =>
      slot.candidates.map((id): [string, typeof slot.assignment] => [
        id,
        slot.assignment,
      ]),
    ),
  );
  return { work, assignments };
}
function validQuestionMetadata(q: PublicBodyPackage["questions"][number]) {
  return !(
    typeof q.title !== "string" ||
    !q.title.trim() ||
    (q.difficulty !== undefined &&
      !["introductory", "intermediate", "advanced"].includes(q.difficulty)) ||
    (q.time !== undefined &&
      (typeof q.time !== "number" ||
        !Number.isFinite(q.time) ||
        q.time <= 0)) ||
    (q.purpose !== undefined &&
      !["demonstration", "discussion", "independent-study", "control"].includes(
        q.purpose,
      ))
  );
}
type SelectionContext = {
  p: PublicBodyPackage;
  work: Work;
  assignments: ReturnType<typeof selectedWork>["assignments"];
  bindings: Record<string, unknown>;
  keys: Set<string>;
};
function selectedQuestion(
  selection: SelectionContext,
  q: PublicBodyPackage["questions"][number],
) {
  const { p, work, assignments, bindings, keys } = selection;
  const questionContext: DiagnosticContext = {
    source: q?.source,
    id: q?.id,
    related: work ? [{ source: work.source, id: work.id }] : [],
    hint: "Проверьте условие, проект и явную привязку этого вопроса",
  };
  const questionFail = (
    message: string,
    field: string,
    cause?: unknown,
  ): never => fail(message, { ...questionContext, field }, cause);
  if (
    !fields(
      q,
      [
        "owner",
        "id",
        "key",
        "title",
        "source",
        "visibility",
        "statementVisibility",
        "hasPublicSolution",
        "answerType",
        "condition",
        "publicAnswer",
      ],
      ["purpose", "difficulty", "time"],
    ) ||
    q.owner !== p.owner ||
    q.key !== p.owner + "/" + q.id ||
    !validQuestionMetadata(q) ||
    !/^exr-[a-z0-9][a-z0-9-]*$/.test(q.id) ||
    keys.has(q.key) ||
    q.visibility !== "public" ||
    !["open", "restricted"].includes(q.statementVisibility) ||
    typeof q.hasPublicSolution !== "boolean" ||
    !["manual", "numeric", "multipart", "matching", "single-choice"].includes(
      q.answerType,
    ) ||
    !Array.isArray(q.condition) ||
    !Array.isArray(q.publicAnswer)
  )
    return questionFail("Неверный публичный вопрос", "questions");
  if (
    ["test", "practical"].includes(work.kind) &&
    q.statementVisibility !== "restricted"
  ) {
    questionFail(
      "В контрольной и практической работе требуется закрытое условие",
      "statementVisibility",
    );
  }
  if (
    assignments[q.key]?.stage === "demonstration" &&
    (q.statementVisibility !== "open" ||
      q.purpose !== "demonstration" ||
      !q.hasPublicSolution)
  ) {
    questionFail(
      "Демонстрация требует открытого условия, роли demonstration и публичного решения",
      "works.assignments." + q.key + ".stage",
    );
  }
  const bindingValue = bindings[q.id];
  if (!record(bindingValue)) {
    return questionFail("Нет привязки вопроса", "binding.questions." + q.id);
  }
  keys.add(q.key);
  return { question: q, binding: bindingValue, diagnostic: questionContext };
}
export async function planSelectedExport(
  p: PublicBodyPackage,
  context: ProjectContext,
  binding: unknown,
) {
  const candidate = Array.isArray(p?.works) ? p.works[0] : undefined;
  const workContext: DiagnosticContext = {
    ...(candidate ? { source: candidate.source, id: candidate.id } : {}),
    field: "works",
    hint: "Экспортируйте одну выбранную работу через установленный Core",
  };
  const refuse = (message: string, field: string): never =>
    fail(message, { ...workContext, field });
  if (
    !fields(p, [
      "schema",
      "owner",
      "release",
      "apiVersion",
      "questions",
      "works",
      "resources",
    ]) ||
    p?.schema !== "course-body-package-v2" ||
    !/^([a-z][a-z0-9-]*)$/.test(p.owner) ||
    !Array.isArray(p.questions) ||
    !p.questions.length ||
    !Array.isArray(p.resources) ||
    !Array.isArray(p.apiVersion)
  ) {
    refuse(
      "Требуется актуальный публичный Body-пакет выбранной работы",
      "body-package",
    );
  }
  if (
    !fields(binding, ["questions"]) ||
    !record(binding.questions) ||
    Object.keys(binding.questions).length !== p.questions.length
  ) {
    refuse(
      "Требуется явная привязка PrairieLearn для каждого выбранного вопроса",
      "binding.questions",
    );
  }
  const root = await Deno.realPath(context.projectRoot);
  const { work, assignments } = selectedWork(p, candidate, workContext);
  if (!record(binding) || !record(binding.questions)) {
    throw Error("PL invalid export plan");
  }
  const selection = {
    p,
    work,
    assignments,
    bindings: binding.questions,
    keys: new Set<string>(),
  };
  const questions = p.questions.map((q) => selectedQuestion(selection, q));
  return { p, context, root, work, workContext, questions };
}
export type SelectedExportPlan = Awaited<ReturnType<typeof planSelectedExport>>;
