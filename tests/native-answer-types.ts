import type { AnswerFacts, NativeResponseSlot } from "course-core/public.ts";
import type { renderNativeAnswer } from "../_extensions/course-prairielearn/application/native-answer.ts";
import type { nativeAnswerBinding } from "../_extensions/course-prairielearn/application/native-delivery.ts";
import type { canonical } from "../_extensions/course-prairielearn/application/source-selection.ts";

type IsAny<T> = 0 extends (1 & T) ? true : false;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;
type Expect<T extends true> = T;

/** Проверяется реальный public Core union, включая будущие дополнения. */
export type NativeAnswerContract = [
  Expect<Equal<IsAny<Parameters<typeof renderNativeAnswer>[0]>, false>>,
  Expect<Equal<Parameters<typeof renderNativeAnswer>[0], AnswerFacts>>,
  Expect<Equal<IsAny<Parameters<typeof nativeAnswerBinding>[2]>, false>>,
  Expect<Equal<Parameters<typeof nativeAnswerBinding>[2], AnswerFacts>>,
  Expect<Equal<
    ReturnType<typeof nativeAnswerBinding>["responseSlots"][number],
    NativeResponseSlot
  >>,
  Expect<Equal<IsAny<Parameters<typeof canonical>[0]>, false>>,
  Expect<Equal<Parameters<typeof canonical>[0], unknown>>,
  Expect<Equal<ReturnType<typeof canonical>, string>>,
];
