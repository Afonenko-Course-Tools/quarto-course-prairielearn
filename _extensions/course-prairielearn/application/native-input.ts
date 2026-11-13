import type { NativeAdapterValidationInput } from "course-core/public.ts";
import type { PublicCore } from "./native-adapter.ts";

/** Единственный data decoder уже аутентичного immutable Core callback input.
 * Schema parsing plain DTO не создаёт live Core authority. */
export const nativeMetadataReadSet = Object.freeze([
  "configuration",
  "assessment",
  "projectChecks",
  "projectMaterialization",
] as const);
export function nativeBusinessInput(
  Core: Pick<PublicCore, "NativeAdapterValidationInputSchema">,
  value: unknown,
) {
  return parsedNativeBusinessInput(
    Core.NativeAdapterValidationInputSchema.parse(value),
  );
}

/** Mapping actual parsed Core input; эта функция не создаёт capability. */
export function parsedNativeBusinessInput(input: NativeAdapterValidationInput) {
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
  for (const slot of nativeMetadataReadSet) {
    if (Object.hasOwn(input.nativeMetadata, slot)) {
      raw[mapping[slot]] = input.nativeMetadata[slot];
    }
  }
  return { input, raw };
}
