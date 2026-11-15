import {
  assertIntegerCourseMaxima,
  courseOptions,
  upstreamCourseValidationInput,
} from "../_extensions/course-prairielearn/application/native-course-options.ts";
import { infoCourse } from "../_extensions/course-prairielearn/application/native-validators.js";
import type { GradingPolicy } from "../_extensions/course-prairielearn/application/grading-policy.ts";
Deno.test(
  "local option overlay preserves official validator closure and validates only its explicit boolean field",
  () => {
    const input = {
      uuid: "12345678-1234-1234-1234-123456789abc",
      name: "TEST",
      title: "Test",
      timezone: "Europe/Minsk",
      topics: [{ name: "Java", color: "blue2" }],
      options: { integerManualPoints: true },
    };
    if (
      infoCourse(input) ||
      !infoCourse(upstreamCourseValidationInput(input))
    ) {
      throw Error("official validator or local overlay changed");
    }
    if (
      infoCourse(
        upstreamCourseValidationInput({
          ...input,
          options: { ...input.options, foreign: true },
        }),
      )
    )
      throw Error("overlay admitted unknown upstream option");
    for (const value of [0, 1, "true", null]) {
      let rejected = false;
      try {
        upstreamCourseValidationInput({
          ...input,
          options: { integerManualPoints: value },
        });
      } catch {
        rejected = true;
      }
      if (!rejected) throw Error("nonboolean opt-in accepted");
    }
    if (
      courseOptions(undefined) !== undefined ||
      courseOptions({ integerManualPoints: false })?.integerManualPoints !==
        false
    )
      throw Error("default/false changed");
  },
);
Deno.test(
  "enabled native course maxima accept integer caps and reject fractional/manual/aggregate unsafe values",
  () => {
    const valid: GradingPolicy = {
      slots: {
        a: { triesPerVariant: 1, autoPoints: 2, manualPoints: 3 },
        b: { triesPerVariant: 1, points: [4, 2.5, 0] },
      },
      assessment: {},
    };
    assertIntegerCourseMaxima(valid, "fixture#work");
    const invalid: GradingPolicy[] = [
      {
        ...valid,
        slots: { a: { triesPerVariant: 1, autoPoints: 2, manualPoints: 0.5 } },
      },
      { ...valid, slots: { a: { triesPerVariant: 1, points: 2.5 } } },
      {
        ...valid,
        slots: { a: { triesPerVariant: 1, points: 2, maxPoints: 2.5 } },
      },
      { ...valid, assessment: { maxPoints: 2.5 } },
      {
        ...valid,
        slots: {
          a: { triesPerVariant: 1, points: Number.MAX_SAFE_INTEGER },
          b: { triesPerVariant: 1, points: 1 },
        },
      },
    ];
    for (const policy of invalid) {
      let message = "";
      try {
        assertIntegerCourseMaxima(policy, "fixture#work");
      } catch (error) {
        message = String(error);
      }
      if (
        !message.includes("PL.GRADING_INVALID: fixture#work") ||
        !message.includes("integerManualPoints")
      )
        throw Error("invalid maximum admitted");
    }
  },
);
