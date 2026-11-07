import type { AnswerFacts, NativeResponseSlot } from "course-core/public.ts";
// @deno-types="../vendor/zod/v4/index.d.ts"
import { z } from "../vendor/zod/v4/index.js";
const slotSchema: z.ZodType<NativeResponseSlot> = z.strictObject({
  name: z.string().min(1),
  type: z.enum(["manual", "numeric", "single-choice", "matching"]),
  anchor: z.string().min(1),
  labelAnchor: z.string().min(1).optional(),
  ordinal: z.number().int().nonnegative().optional(),
  options: z.array(
    z.strictObject({
      anchor: z.string().min(1),
      ordinal: z.number().int().nonnegative(),
    }),
  ).min(1).optional(),
});
/** Public bindings: только уже проверенные selected Core slots; ключ ответа сюда не попадает. */
export function nativeAnswerBinding(
  uuid: string,
  method: string,
  answer: AnswerFacts,
  inputSlots: unknown,
) {
  const slots = z.array(slotSchema).min(1).max(4096).parse(inputSlots);
  if (!Array.isArray(slots) || !slots.length) {
    throw Error("PL.NATIVE_SLOTS_REQUIRED");
  }
  let expected: [string, NativeResponseSlot["type"]][];
  let metadataMismatch: boolean;
  switch (answer.type) {
    case "manual":
    case "numeric":
      expected = [["answer", answer.type]];
      metadataMismatch = slots.some((s) => Object.keys(s).length !== 3);
      break;
    case "single-choice":
      expected = Array.from(
        { length: answer.count },
        () => ["answer", "single-choice"],
      );
      metadataMismatch = slots.some((s, i) =>
        s.ordinal !== i || !s.labelAnchor || s.options !== undefined
      );
      break;
    case "matching":
      expected = answer.prompts.map((_, i) => ["match-" + i, "matching"]);
      metadataMismatch = slots.some((s, i) =>
        s.ordinal !== i || !s.labelAnchor || !s.options ||
        s.options.length !== answer.options.length ||
        s.options.some((o, j) => o.ordinal !== j)
      );
      break;
    case "multipart":
      expected = answer.parts.map((p) => [p.name, p.type]);
      metadataMismatch = slots.some((s) =>
        !s.labelAnchor || s.ordinal !== undefined || s.options !== undefined
      );
      break;
    default:
      answer satisfies never;
      throw Error("PL.ANSWER_UNQUALIFIED: canonical Core answer required");
  }
  if (
    JSON.stringify(slots.map((s) => [s.name, s.type])) !==
      JSON.stringify(expected) || metadataMismatch
  ) throw Error("PL.NATIVE_SLOT_MISMATCH");
  const types = new Set(slots.map((s) => s.type));
  const expectedMethod = types.has("manual")
    ? types.size === 1 ? "manual" : "mixed"
    : "external";
  if (method !== expectedMethod) throw Error("PL.NATIVE_METHOD_MISMATCH");
  const allowed = new Set([
    "name",
    "type",
    "anchor",
    "labelAnchor",
    "ordinal",
    "options",
  ]);
  if (
    slots.some((s) =>
      Object.keys(s).some((k) => !allowed.has(k)) || !s.anchor
    ) || new Set(slots.map((s) => s.anchor)).size !== slots.length
  ) throw Error("PL.NATIVE_SLOT_MISMATCH");
  return {
    kind: "native-answer",
    uuid,
    grading: { method },
    answerType: answer.type,
    responseSlots: structuredClone(slots),
    upstreamGradingMethod: expectedMethod === "manual" ? "Manual" : "Internal",
  };
}
