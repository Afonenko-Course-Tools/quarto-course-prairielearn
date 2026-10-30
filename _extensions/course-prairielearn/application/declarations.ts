import { submission as parseSubmission } from "./submission.ts";
import { createMetrics as __createMetrics } from "../observability/bridge.ts";
const __metrics = __createMetrics("course-prairielearn");
export const object = (v: any) =>
  v !== null && typeof v === "object" && !Array.isArray(v);
export function closed(v: any, required: string[], optional: string[] = []) {
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
}
export function question(v: any) {
  closed(v, ["topic", "submission"], ["single-variant", "grading"]);
  if (
    Object.hasOwn(v, "single-variant") &&
    typeof v["single-variant"] !== "boolean"
  ) throw Error("PL single-variant requires boolean");
  if (typeof v.topic !== "string" || !v.topic.trim()) {
    throw new Error("PL topic required");
  }
  const submission = parseSubmission(v.submission, true);
  if (
    submission.mode === "workspace" &&
    (v.grading?.method !== "manual" || v["single-variant"] === false)
  ) {
    throw Error(
      "PL.WORKSPACE_INVALID: Workspace требует Manual и single-variant: true",
    );
  }
  return {
    topic: v.topic,
    ...(v.grading !== undefined && v.grading !== "external"
      ? { grading: gradingMethod(v.grading) }
      : {}),
    ...(Object.hasOwn(v, "single-variant")
      ? { singleVariant: v["single-variant"] }
      : {}),
    ...(submission.mode === "workspace" ? { singleVariant: true } : {}),
    submission,
  };
}
export function gradingMethod(
  value: any,
): { method: "external" | "manual" | "mixed" } {
  if (value === undefined || value === "external") {
    return { method: "external" };
  }
  closed(value, ["method"]);
  if (!["manual", "mixed"].includes(value.method)) {
    throw Error(
      "PL.GRADING_INVALID: grading.method должен быть manual или mixed",
    );
  }
  return { method: value.method };
}
export function declarations(raw: any, key: string) {
  closed(raw, ["delivery", "question-defaults"], ["assessment-defaults"]);
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
