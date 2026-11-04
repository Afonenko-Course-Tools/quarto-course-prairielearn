import type { NativeAdapterValidationInput } from "course-core/public.ts";
import type { PublicCore } from "./native-adapter.ts";

/** Единственный data decoder уже аутентичного immutable Core callback input.
 * Schema parsing plain DTO не создаёт live Core authority. */
export const nativeMetadataReadSet = Object.freeze(
  [
    "configuration",
    "assessment",
    "projectChecks",
    "projectMaterialization",
  ] as const,
);
export function nativeBusinessInput(
  Core: Pick<PublicCore, "NativeAdapterValidationInputSchema">,
  value: unknown,
) {
  return parsedNativeBusinessInput(Core.NativeAdapterValidationInputSchema.parse(value));
}

/** Mapping actual parsed Core input; эта функция не создаёт capability. */
export function parsedNativeBusinessInput(input: NativeAdapterValidationInput) {
  const envelope = input.nativeMetadata, slots = nativeMetadataReadSet;
  if (
    !envelope || !Array.isArray(envelope.readSet) ||
    envelope.readSet.length !== slots.length ||
    slots.some((slot) => !envelope.readSet.includes(slot)) ||
    !envelope.values ||
    Object.keys(envelope.values).some((key) =>
      !slots.some((slot) => slot === key)
    )
  ) {
    throw Error("PL.CAPTURE_CHANGED: missing or incomplete nativeMetadata");
  }
  const mapping = {
    configuration: "config",
    assessment: "assessment",
    projectChecks: "projectChecks",
    projectMaterialization: "materialization",
  } as const;
  const raw: Record<string, unknown> = {
    declarations: input.declarations.map((d) => ({
      id: d.id,
      attributes: structuredClone(d.attributes),
      ...(d.answer ? { answer: true } : {}),
    })),
  };
  for (const slot of slots) {
    if (Object.hasOwn(envelope.values, slot)) {
      raw[mapping[slot]] = envelope.values[slot];
    }
  }
  return { input, raw };
}
