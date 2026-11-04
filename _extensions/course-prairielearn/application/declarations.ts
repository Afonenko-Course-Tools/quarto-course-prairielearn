import { NativeSeedTargetsSchema } from "./native-materialization.ts";
import { submission as parseSubmission } from "./submission.ts";
import { createMetrics as __createMetrics } from "../observability/bridge.ts";
const __metrics = __createMetrics("course-prairielearn");
export const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
export function closed(v: unknown, required: string[], optional: string[] = []) {
  if (!object(v)) throw new Error("PL.DECLARATION_INVALID: expected map");
  const missing = required.filter((k) => !Object.hasOwn(v, k));
  const unknown = Object.keys(v).filter((k) =>
    ![...required, ...optional].includes(k)
  );
  if (missing.length || unknown.length) {
    throw new Error(
      "PL.DECLARATION_INVALID: " +
        (missing.length
          ? "missing " + missing.join(", ")
          : "unknown " + unknown.join(", ")),
    );
  }
  return v;
}
function readQuestion(value: unknown, complete: boolean) {
  const v = closed(value, complete ? ["topic", "submission"] : [], complete
    ? ["single-variant", "grading"] : ["topic", "submission", "single-variant", "grading"]);

  let singleVariant: boolean | undefined;
  if (Object.hasOwn(v, "single-variant")) {
    const value = v["single-variant"];
    if (typeof value !== "boolean") throw Error("PL single-variant requires boolean");
    singleVariant = value;
  }
  let topic: string | undefined;
  if (Object.hasOwn(v, "topic")) {
    const value = v.topic;
    if (typeof value !== "string" || !value.trim()) throw Error("PL topic required");
    topic = value;
  }
  const submission = Object.hasOwn(v, "submission")
    ? parseSubmission(v.submission, true)
    : undefined;
  const grading = gradingMethod(v.grading);
  if (
    submission?.mode === "workspace" &&
    (grading.method !== "manual" || v["single-variant"] === false)
  ) {
    throw Error(
      "PL.WORKSPACE_INVALID: Workspace требует Manual и single-variant: true",
    );
  }
  return { submission, grading, topic, singleVariant };
}
/** Частичная native publication policy: отсутствие поля не становится default delivery. */
export function publicationQuestion(v: unknown) {
  const { submission, grading, topic, singleVariant } = readQuestion(v, false);
  return {
    ...(topic !== undefined ? { topic } : {}),
    ...(submission ? { submission } : {}), grading,
    ...(singleVariant !== undefined ? { singleVariant } : {}),
    ...(submission?.mode === "workspace" ? { singleVariant: true } : {}),
  };
}
export function question(v: unknown) {
  const { submission, grading, topic, singleVariant } = readQuestion(v, true);
  return {
    topic: topic!,
    ...(grading.method !== "external" ? { grading } : {}),
    ...(singleVariant !== undefined ? { singleVariant } : {}),
    ...(submission?.mode === "workspace" ? { singleVariant: true } : {}),
    submission: submission!,
  };
}
export function gradingMethod(value: unknown): { method: "external" | "manual" | "mixed" } {
  if (value === undefined || value === "external") return { method: "external" };
  const record = closed(value, ["method"]);
  const method = record.method;
  if (method !== "manual" && method !== "mixed") {
    throw Error("PL.GRADING_INVALID: grading.method должен быть manual или mixed");
  }
  return { method };
}
export function declarations(raw: any, key: string) {
  closed(raw, ["delivery", "question-defaults"], [
    "assessment-defaults",
    "seed-targets",
  ]);
  if (
    object(raw["assessment-defaults"]) &&
    Object.hasOwn(raw["assessment-defaults"], "uuid")
  ) {
    throw Error(
      "PL.ASSESSMENT_INVALID: uuid разрешён только в локальной assessment.prairielearn, не в assessment-defaults",
    );
  }
  if (raw["seed-targets"] !== undefined) {
    NativeSeedTargetsSchema.parse(raw["seed-targets"]);
  }
  closed(raw.delivery, ["book", "course", "instances"]);
  const course = raw.delivery.course;
  closed(course, ["name", "title", "timezone", "topics"]);
  for (const f of ["name", "title", "timezone"]) {
    if (typeof course[f] !== "string" || !course[f].trim()) {
      throw new Error("PL course " + f + " required");
    }
  }
  try {
    new Intl.DateTimeFormat("en", { timeZone: course.timezone });
  } catch {
    throw new Error("PL timezone invalid");
  }
  if (!Array.isArray(course.topics) || !course.topics.length) {
    throw new Error("PL topics required");
  }
  for (const topic of course.topics) {
    closed(topic, ["name", "color", "description"]);
    if (Object.values(topic).some((v) => typeof v !== "string" || !v)) {
      throw new Error("PL topic invalid");
    }
  }
  if (
    !object(raw.delivery.instances) ||
    !Object.hasOwn(raw.delivery.instances, key) ||
    !/^[a-z0-9][a-z0-9-]*$/.test(key)
  ) throw new Error("PL instance missing");
  for (
    const [id, v] of Object.entries(raw.delivery.instances) as [string, any][]
  ) {
    closed(v, ["title", "self-enrollment", "works", "publishing"]);
    closed(v.publishing, ["start-date", "end-date"]);
    const dates = [v.publishing["start-date"], v.publishing["end-date"]];
    const timestamp =
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
    if (
      dates.some((date) =>
        typeof date !== "string" || !timestamp.test(date) ||
        !Number.isFinite(Date.parse(date)) ||
        new Date(Date.parse(date.slice(0, 19) + "Z")).toISOString().slice(
            0,
            19,
          ) !== date.slice(0, 19)
      ) || Date.parse(dates[0]) >= Date.parse(dates[1])
    ) {
      throw new Error(
        "PL instance publishing requires ordered explicit timestamps with offsets",
      );
    }
    if (
      !/^[a-z0-9][a-z0-9-]*$/.test(id) || typeof v.title !== "string" ||
      !v.title || typeof v["self-enrollment"] !== "boolean" ||
      !Array.isArray(v.works) || !v.works.length ||
      new Set(v.works).size !== v.works.length || v.works.some((w: any) =>
        typeof w !== "string" || !/^sec-[a-z0-9-]+$/.test(w)
      )
    ) {
      throw new Error("PL instance invalid");
    }
  }
  return {
    raw,
    book: raw.delivery.book,
    course,
    instance: raw.delivery.instances[key],
    defaults: question(raw["question-defaults"]),
  };
}

// @ts-expect-error JS допускает замену function binding; сигнатура публичного API сохраняется.
closed = __metrics.wrapSync({
  id: "course-prairielearn.application.declarations.closed",
  kind: "phase",
}, closed);
// @ts-expect-error JS допускает замену function binding; сигнатура публичного API сохраняется.
question = __metrics.wrapSync({
  id: "course-prairielearn.application.declarations.question",
  kind: "phase",
}, question);
// @ts-expect-error JS допускает замену function binding; сигнатура публичного API сохраняется.
declarations = __metrics.wrapSync({
  id: "course-prairielearn.application.declarations.declarations",
  kind: "phase",
}, declarations);
