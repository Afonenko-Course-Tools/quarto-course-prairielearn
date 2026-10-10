import { closed } from "./declarations.ts";
const scalar = (v: any) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0;
const attempts = (v: any) => Number.isSafeInteger(v) && v >= 1;
const questionFields = [
  "question-points",
  "question-max-points",
  "attempts",
  "advance-score-perc",
];
export function gradingPolicy(work: any) {
  const policy = work.extensions.prairielearn;
  const source = `${work.source ?? "course"}#${work.id}`;
  const fail = (field: string, reason: string): never => {
    throw new Error(
      `PL.GRADING_INVALID: ${source} ${field}: ${reason}; declare assessment.prairielearn or prairielearn.assessment-defaults in course/directory/document metadata`,
    );
  };
  closed(policy, ["attempts", "pass"], [
    "assignment",
    "question-points",
    "question-max-points",
    "question-overrides",
    "max-points",
    "grade-rate-minutes",
    "advance-score-perc",
    "allow-multiple-instances",
  ]);
  if (!attempts(policy.attempts)) {
    fail("attempts", "expected positive integer (native triesPerVariant)");
  }
  if (policy["max-points"] != null && !scalar(policy["max-points"])) {
    fail("max-points", "expected finite nonnegative number or null");
  }
  if (
    policy["grade-rate-minutes"] !== undefined &&
    !scalar(policy["grade-rate-minutes"])
  ) fail("grade-rate-minutes", "expected finite nonnegative number");
  if (
    policy["allow-multiple-instances"] !== undefined &&
    typeof policy["allow-multiple-instances"] !== "boolean"
  ) fail("allow-multiple-instances", "expected boolean");
  const overrides = policy["question-overrides"] === undefined
    ? {}
    : policy["question-overrides"];
  closed(overrides, [], work.items);
  const exam = ["test", "practical"].includes(work.kind);
  if (!exam && policy["allow-multiple-instances"] === true) {
    fail(
      "allow-multiple-instances",
      "pinned Community forbids multiple Homework instances",
    );
  }
  const questions: Record<string, any> = {};
  for (const id of work.items) {
    const override = overrides[id] === undefined ? {} : overrides[id];
    closed(override, [], questionFields);
    const effective = {
      ...Object.fromEntries(
        questionFields.filter((f) => Object.hasOwn(policy, f)).map(
          (f) => [f, policy[f]],
        ),
      ),
      ...override,
    };
    const points = effective["question-points"];
    if (points === undefined) {
      fail(`question-points (${id})`, "missing explicit authored points");
    }
    if (
      !scalar(points) &&
      !(exam && Array.isArray(points) && points.length &&
        points.every(scalar) && points.every((p: any, i: number) =>
          i === 0 || p <= points[i - 1]
        ))
    ) {
      fail(
        `question-points (${id})`,
        exam
          ? "expected nonnegative scalar or nonincreasing nonempty array"
          : "Homework requires a nonnegative scalar",
      );
    }
    if (
      work.assignments?.[id]?.requirement !== "optional" &&
      (Array.isArray(points) ? points.includes(0) : points === 0)
    ) {
      fail(
        `question-points (${id})`,
        "required questions must have positive points; zero-point completion is unsupported",
      );
    }
    const ceiling = effective["question-max-points"];
    if (ceiling != null && (!scalar(ceiling) || exam)) {
      fail(
        `question-max-points (${id})`,
        exam
          ? "Exam forbids ceilings; explicitly clear inherited value with null"
          : "expected nonnegative scalar or null",
      );
    }
    if (ceiling === 0 && work.assignments?.[id]?.requirement !== "optional") {
      fail(
        `question-max-points (${id})`,
        "required question ceiling must be positive; native zero-ceiling grading cannot complete a required question",
      );
    }
    if (!exam && points === 0 && ceiling != null && ceiling > 0) {
      fail(
        `question-max-points (${id})`,
        "Homework forbids zero points with positive ceiling",
      );
    }
    if (!attempts(effective.attempts)) {
      fail(`attempts (${id})`, "expected positive integer");
    }
    const advance = effective["advance-score-perc"];
    if (advance !== undefined && (!scalar(advance) || advance > 100)) {
      fail(`advance-score-perc (${id})`, "expected number from 0 to 100");
    }
    questions[id] = {
      points,
      triesPerVariant: effective.attempts,
      ...(ceiling != null ? { maxPoints: ceiling } : {}),
      ...(advance !== undefined ? { advanceScorePerc: advance } : {}),
    };
  }
  return {
    questions,
    assessment: {
      ...(policy["max-points"] != null
        ? { maxPoints: policy["max-points"] }
        : {}),
      ...(policy["grade-rate-minutes"] !== undefined
        ? { gradeRateMinutes: policy["grade-rate-minutes"] }
        : {}),
      ...(policy["allow-multiple-instances"] !== undefined
        ? { multipleInstance: policy["allow-multiple-instances"] }
        : {}),
    },
  };
}
