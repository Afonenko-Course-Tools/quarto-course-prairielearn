// @deno-types="../vendor/zod/v4/index.d.ts"
import { z } from "../vendor/zod/v4/index.js";
const slotSchema = z.strictObject({
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
  answer: any,
  slots: any[],
) {
  slots = z.array(slotSchema).min(1).max(4096).parse(slots);
  if (!Array.isArray(slots) || !slots.length) {
    throw Error("PL.NATIVE_SLOTS_REQUIRED");
  }
  const expected = answer.type === "multipart"
    ? answer.parts.map((p: any) => [p.name, p.type])
    : answer.type === "matching"
    ? answer.prompts.map((_: any, i: number) => ["match-" + i, "matching"])
    : answer.type === "single-choice"
    ? Array.from({ length: answer.count }, () => ["answer", "single-choice"])
    : [["answer", answer.type]];
  if (
    JSON.stringify(slots.map((s) => [s.name, s.type])) !==
      JSON.stringify(expected)
  ) throw Error("PL.NATIVE_SLOT_MISMATCH");
  if (
    slots.some((s, i) =>
      answer.type === "single-choice"
        ? s.ordinal !== i || !s.labelAnchor || s.options !== undefined
        : answer.type === "matching"
        ? s.ordinal !== i || !s.labelAnchor || !s.options ||
          s.options.length !== answer.options.length ||
          s.options.some((o: any, j: number) => o.ordinal !== j)
        : answer.type === "multipart"
        ? !s.labelAnchor || s.ordinal !== undefined || s.options !== undefined
        : Object.keys(s).length !== 3
    )
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
