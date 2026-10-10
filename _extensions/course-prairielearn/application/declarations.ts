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
  closed(v, ["topic", "submission"], ["single-variant"]);
  if (
    Object.hasOwn(v, "single-variant") &&
    typeof v["single-variant"] !== "boolean"
  ) throw Error("PL single-variant requires boolean");
  if (typeof v.topic !== "string" || !v.topic.trim()) {
    throw new Error("PL topic required");
  }
  closed(v.submission, ["mode"], ["ace-mode"]);
  if (
    !["editor", "upload"].includes(v.submission.mode) ||
    v.submission["ace-mode"] !== undefined &&
      (v.submission.mode !== "editor" ||
        !/^ace\/mode\/[a-z][a-z0-9_]*$/.test(v.submission["ace-mode"]))
  ) throw new Error("PL submission invalid");
  return {
    topic: v.topic,
    ...(Object.hasOwn(v, "single-variant")
      ? { singleVariant: v["single-variant"] }
      : {}),
    submission: {
      mode: v.submission.mode,
      ...(v.submission["ace-mode"]
        ? { aceMode: v.submission["ace-mode"] }
        : {}),
    },
  };
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
    !/^[a-z][a-z0-9-]*$/.test(key)
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
      !/^[a-z][a-z0-9-]*$/.test(id) || typeof v.title !== "string" ||
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
