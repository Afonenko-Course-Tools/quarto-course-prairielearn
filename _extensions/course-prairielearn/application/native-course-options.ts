// @deno-types="../vendor/zod/v4/index.d.ts"
import { z } from "../vendor/zod/v4/index.js";
import type { GradingPolicy } from "./grading-policy.ts";
const optionsSchema = z.strictObject({
  integerManualPoints: z.boolean().optional(),
});
export function courseOptions(value: unknown) {
  return value === undefined ? undefined : optionsSchema.parse(value);
}
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
/** Local native overlay; official frozen JSON schemas and generated validators stay intact. */
export function upstreamCourseValidationInput(value: unknown): unknown {
  if (
    !record(value) ||
    !record(value.options) ||
    !Object.hasOwn(value.options, "integerManualPoints")
  )
    return value;
  const { integerManualPoints, ...options } = value.options;
  z.boolean().parse(integerManualPoints);
  return { ...value, options };
}
export function assertIntegerCourseMaxima(
  policy: GradingPolicy,
  source: string,
): void {
  const integer = (value: number) => Number.isSafeInteger(value) && value >= 0;
  const fail: (field: string) => never = (field) => {
    throw Error(
      `PL.GRADING_INVALID: ${source} ${field}: integerManualPoints требует неотрицательный безопасный целый максимум; измените явную политику весов или отключите opt-in`,
    );
  };
  let total = 0;
  for (const [id, points] of Object.entries(policy.slots)) {
    const manual = points.manualPoints ?? 0;
    const authored = points.points;
    const maximum =
      points.maxPoints ??
      (authored === undefined
        ? (points.autoPoints ?? 0) + manual
        : Array.isArray(authored)
          ? authored[0]
          : authored);
    if (!integer(manual)) fail(`manual-points (${id})`);
    if (maximum === undefined || !integer(maximum)) fail(`max-points (${id})`);
    total += maximum;
  }
  if (!integer(policy.assessment.maxPoints ?? total)) {
    fail("assessment max-points");
  }
}
