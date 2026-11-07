import type { NativeAdapterValidationInput } from "course-core/public.ts";
import type { validateSlots, qualifiedSlots, nativeSlotZones } from "../_extensions/course-prairielearn/application/slots.ts";
import type { gradingPolicy } from "../_extensions/course-prairielearn/application/grading-policy.ts";
import type { completionPolicy, evaluateCompletion } from "../_extensions/course-prairielearn/application/completion.ts";

type IsAny<T> = 0 extends (1 & T) ? true : false;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;
type Expect<T extends true> = T;
type Slot = NonNullable<NativeAdapterValidationInput["assessment"]>["slots"][number];

/** Предотвращает утечку динамического входа через публичные результаты адаптера. */
export type AssessmentBoundary = [
  Expect<Equal<Parameters<typeof validateSlots>[0], unknown>>,
  Expect<Equal<ReturnType<typeof validateSlots>[number], Slot>>,
  Expect<Equal<IsAny<Parameters<typeof qualifiedSlots>[1]>, false>>,
  Expect<Equal<IsAny<Parameters<typeof nativeSlotZones>[2]>, false>>,
  Expect<Equal<IsAny<Parameters<typeof gradingPolicy>[0]>, false>>,
  Expect<Equal<IsAny<ReturnType<typeof gradingPolicy>["slots"][string]>, false>>,
  Expect<Equal<IsAny<Parameters<typeof completionPolicy>[1]>, false>>,
  Expect<Equal<Parameters<typeof evaluateCompletion>[1], unknown>>,
];
