import { decodePublicationBusiness } from "./native-business.ts";
import { nativeBusinessInput, nativeMetadataReadSet } from "./native-input.ts";
import { safePath } from "./source-selection.ts";
import { diagnostic } from "./diagnostics.ts";
/** Один genuine ordinary Core release callback. Результат — data для авторской
 * инспекции; он не даёт assignment delivery, A1/lease или publish authority. */
export async function inspectPublication(
  Core: any,
  operation: any,
  request: { expectedSources: string[]; courseId?: string },
) {
  const loaded = new Map<
    string,
    { input: any; business: ReturnType<typeof decodePublicationBusiness> }
  >();
  const proof = await operation.validateRelease(request, [{
    name: "prairielearn",
    nativeMetadataReadSet,
    validate(value: unknown) {
      const { input, raw } = nativeBusinessInput(Core, value);
      try {
        if (loaded.has(input.origin.source)) {
          throw Error("PL.ASSESSMENT_INVALID: duplicate source");
        }
        const business = decodePublicationBusiness(raw, input, {
          deferComposition: true,
        });
        const sources = [];
        for (const declaration of input.declarations) {
          if (declaration.answer) continue;
          const path = declaration.attributes.project?.replace(/^\//, "");
          if (!safePath(path)) {
            throw Error("PL.PROJECT_INVALID: требуется owner-relative project");
          }
          sources.push({ path, kind: "directory" as const });
          for (
            const common of business.materialization?.projects[declaration.id]
              ?.["common-files"] ?? []
          ) sources.push({ path: common.source, kind: "file" as const });
        }
        loaded.set(input.origin.source, { input, business });
        return { sources };
      } catch (cause) {
        throw diagnostic(
          "PL.DECLARATION_INVALID",
          cause instanceof Error ? cause.message : String(cause),
          { source: input.origin.source, field: "prairielearn" },
          cause,
        );
      }
    },
  }]);
  if (!proof.validatedAdapters.includes("prairielearn")) {
    return { proof, course: structuredClone(proof.course), documents: [] };
  }
  if (
    loaded.size !== request.expectedSources.length ||
    request.expectedSources.some((source) => !loaded.has(source))
  ) throw Error("PL.ASSESSMENT_INVALID: incomplete owner source coverage");
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
    if (business.assessment) {
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
  await operation.assertCurrent();
  return {
    proof,
    course: structuredClone(proof.course),
    documents: request.expectedSources.map((source) => {
      const { input, business } = loaded.get(source)!;
      return {
        source,
        format: input.origin.format,
        assessment: input.assessment,
        business,
      };
    }),
  };
}
