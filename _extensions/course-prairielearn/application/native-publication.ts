import type { NativeAdapterValidationInput, NativePublication } from "course-core/public.ts";
import { decodePublicationBusiness } from "./native-business.ts";
import { parsedNativeBusinessInput, nativeMetadataReadSet } from "./native-input.ts";
import { safePath } from "./source-selection.ts";
import { diagnostic } from "./diagnostics.ts";
/** Ordinary business inspection; full grading/seed admission принадлежит course export. */
export async function inspectPublication(publication: NativePublication) {
  const loaded = new Map<string, {
    input: NativeAdapterValidationInput;
    business: ReturnType<typeof decodePublicationBusiness>;
  }>();
  const inputs = publication.adapterInputs("prairielearn", nativeMetadataReadSet);
  const sources = publication.catalog.documents.map((d) => d.source);
  if (!publication.course.adapters.includes("prairielearn")) {
    return { course: structuredClone(publication.course), documents: [] };
  }
  for (const value of inputs) {
    const { input, raw } = parsedNativeBusinessInput(value);
    try {
      if (loaded.has(input.origin.source)) throw Error("PL.ASSESSMENT_INVALID: duplicate source");
      const business = decodePublicationBusiness(raw, input, { deferComposition: true });
      const references: { path: string; kind: "directory" | "file" }[] = [];
      for (const declaration of input.declarations) {
        if (declaration.answer) continue;
        const path = declaration.attributes.project?.replace(/^\//, "");
        if (!safePath(path)) throw Error("PL.PROJECT_INVALID: требуется owner-relative project");
        references.push({ path, kind: "directory" });
        for (const common of business.materialization?.projects[declaration.id]?.["common-files"] ?? []) {
          references.push({ path: common.source, kind: "file" });
        }
      }
      await publication.checkSources(input.origin.source, references);
      loaded.set(input.origin.source, { input, business });
    } catch (cause) {
      throw diagnostic("PL.DECLARATION_INVALID", cause instanceof Error ? cause.message : String(cause),
        { source: input.origin.source, field: "prairielearn" }, cause);
    }
  }
  if (loaded.size !== sources.length || sources.some((source) => !loaded.has(source))) {
    throw Error("PL.ASSESSMENT_INVALID: incomplete owner source coverage");
  }
  const questions = new Set<string>();
  for (const { input } of loaded.values()) {
    for (const d of input.declarations) {
      if (questions.has(d.id)) {
        throw Error("PL.ASSESSMENT_INVALID: duplicate declaration");
      }
      questions.add(d.id);
    }
  }
  for (const { input, business } of loaded.values()) {
    if (business.assessment && input.assessment) {
      for (const slot of input.assessment.slots) {
        for (const id of slot.candidates) {
          if (!questions.has(id)) {
            throw diagnostic(
              "PL001_externalAssessmentMembers",
              "В работу PrairieLearn входит задание другой платформы",
              {
                source: input.origin.source,
                id: input.assessment.id,
                field: "task-items",
                related: [{ id, field: "target" }],
              },
            );
          }
        }
      }
    }
  }
  return {
    course: structuredClone(publication.course),
    documents: sources.map((source) => {
      const item = loaded.get(source);
      if (!item) throw Error("PL.ASSESSMENT_INVALID: missing source");
      const { input, business } = item;
      return {
        source,
        format: input.origin.format,
        assessment: input.assessment,
        business,
      };
    }),
  };
}

export type PublicationInspection = Awaited<ReturnType<typeof inspectPublication>>;
