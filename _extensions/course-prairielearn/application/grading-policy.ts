import {createMetrics as __createMetrics} from "../observability/bridge.ts";
const __metrics=__createMetrics("course-prairielearn");
import { closed } from "./declarations.ts";
import { validateSlots } from "./slots.ts";
import type { SlotWork } from "./slots.ts";
export type GradingWork = SlotWork & {
  kind: string;
  source?: string;
  extensions: { prairielearn: unknown };
};
export interface NativeSlotPoints {
  triesPerVariant: number;
  points?: number | number[];
  maxPoints?: number;
  autoPoints?: number;
  manualPoints?: number;
  advanceScorePerc?: number;
}
export interface GradingPolicy {
  slots: Record<string, NativeSlotPoints>;
  assessment: { maxPoints?: number; gradeRateMinutes?: number; multipleInstance?: boolean };
}
// Форма UUID совпадает с закреплённой native infoAssessment schema.
export const assessmentUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const scalar = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0;
const attempts = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 1;
function decreasingPoints(v: unknown): v is number[] {
  if (!Array.isArray(v) || !v.length) return false;
  let previous = Infinity;
  for (const point of v) {
    if (!scalar(point) || point > previous) return false;
    previous = point;
  }
  return true;
}
const questionFields = [
  "question-points",
  "question-max-points",
  "attempts",
  "advance-score-perc",
  "auto-points",
  "manual-points",
];
function readGradingPolicy(work: GradingWork): GradingPolicy {
  const policy = closed(work.extensions.prairielearn, ["attempts", "pass"], [
    "assignment", "uuid", "question-points", "question-max-points", "slot-overrides",
    "max-points", "grade-rate-minutes", "advance-score-perc", "allow-multiple-instances", "auto-points", "manual-points",
  ]);
  const workSlots = validateSlots(work.slots, "", work.id);
  const source = `${work.source ?? "course"}#${work.id}`;
  function fail(field: string, reason: string): never {
    throw new Error(
      `PL.GRADING_INVALID: ${source} ${field}: ${reason}; declare assessment.prairielearn or prairielearn.assessment-defaults in course/directory/document metadata`,
    );
  }
  if (
    Object.hasOwn(policy, "uuid") &&
    (typeof policy.uuid !== "string" || !assessmentUuidPattern.test(policy.uuid))
  ) {
    throw Error(
      `PL.ASSESSMENT_INVALID: ${source} uuid: ожидается native UUID контрольной работы`,
    );
  }
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
  const overrides = closed(policy["slot-overrides"] === undefined ? {} : policy["slot-overrides"], [], workSlots.map((slot) => slot.id));
  const exam = ["test", "practical"].includes(work.kind);
  if (!exam && policy["allow-multiple-instances"] === true) {
    fail(
      "allow-multiple-instances",
      "pinned Community forbids multiple Homework instances",
    );
  }
  const slots: Record<string, NativeSlotPoints> = {};
  for (const slot of workSlots) {
    const id=slot.id;
    const override = closed(overrides[id] === undefined ? {} : overrides[id], [], questionFields);
    const effective: Record<string, unknown> = {
      ...Object.fromEntries(
        questionFields.filter((f) => Object.hasOwn(policy, f)).map(
          (f) => [f, policy[f]],
        ),
      ),
      ...override,
    };
    const components=Object.hasOwn(effective,'auto-points')||Object.hasOwn(effective,'manual-points');
    if(components){
      if(Object.hasOwn(effective,'question-points')||effective['question-max-points']!=null)fail(`points (${id})`,'Не смешивайте question-points/ceiling с auto-points/manual-points');
      const auto=effective['auto-points']??0,manual=effective['manual-points'];
      const unweighted = slot.assignment.requirement === 'optional' && auto === 0 && manual === 0;
      if(!scalar(auto)||!scalar(manual)||manual<=0&&!unweighted)fail(`manual-points (${id})`,'Нужны неотрицательные auto-points и положительные manual-points; нулевые компоненты допустимы только для добровольной практики');
      if(!attempts(effective.attempts))fail(`attempts (${id})`,'Требуется положительное число попыток');
      const advance=effective['advance-score-perc'];
      if(advance!==undefined&&(!scalar(advance)||advance>100))fail(`advance-score-perc (${id})`,'Требуется число от 0 до 100');
      slots[id]={autoPoints:auto,manualPoints:manual,triesPerVariant:effective.attempts,...(advance!==undefined?{advanceScorePerc:advance}:{})};
      continue;
    }
    const points = effective["question-points"];
    if (points === undefined) {
      fail(`question-points (${id})`, "missing explicit authored points");
    }
    if (
      !scalar(points) &&
      !(exam && decreasingPoints(points))
    ) {
      fail(
        `question-points (${id})`,
        exam
          ? "expected nonnegative scalar or nonincreasing nonempty array"
          : "Homework requires a nonnegative scalar",
      );
    }
    if (
      slot.assignment.requirement !== "optional" &&
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
    if (ceiling === 0 && slot.assignment.requirement !== "optional") {
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
    slots[id] = {
      points,
      triesPerVariant: effective.attempts,
      ...(ceiling != null ? { maxPoints: ceiling } : {}),
      ...(advance !== undefined ? { advanceScorePerc: advance } : {}),
    };
  }
  return {
    slots,
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
export const gradingPolicy = __metrics.wrapSync({id:"course-prairielearn.application.grading-policy.gradingPolicy",kind:"phase"}, readGradingPolicy);

export function validateGradingComponents(work: GradingWork, methods: Readonly<Record<string, unknown>>): GradingPolicy {
  const policy = gradingPolicy(work);
  for (const slot of validateSlots(work.slots, "", work.id)) for (const id of slot.candidates) {
    const method = methods[id], points = policy.slots[slot.id];
    if (points === undefined) throw Error("PL.GRADING_INVALID: отсутствуют native points для " + slot.id);
    const auto = points.autoPoints, manual = points.manualPoints;
    const unweighted = slot.assignment.requirement === "optional" && auto === 0 && manual === 0;
    const valid = unweighted && (method === "external" || method === "manual" || method === "mixed") ||
      (method === "manual" ? auto === 0 && manual !== undefined && manual > 0 :
       method === "mixed" ? auto !== undefined && auto > 0 && manual !== undefined && manual > 0 :
       method === "external" ? manual === undefined : false);
    if (!valid) throw Error("PL.GRADING_INVALID: " + id + " — native компоненты оценки не соответствуют grading.method");
  }
  return policy;
}
