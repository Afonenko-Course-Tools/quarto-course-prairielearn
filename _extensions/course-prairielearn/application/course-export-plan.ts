import type {
  AnswerFacts,
  NativeAdapterValidationInput,
  NativeProjectFact,
  NativeResponseSlot,
  PublicBodyPackage,
} from "course-core/public.ts";
import type { NativeAuxiliary } from "./native-auxiliary.ts";
import type { NativeCourseChecks } from "./native-check-inventory.ts";
import type { RuntimeProfile } from "./runtime-descriptor.ts";
import type { AssessmentPolicySchema } from "./native-business.ts";
import type { CheckedNativeProjectFact } from "./native-check-projection.ts";
import type { materializeNativeQuestion } from "./native-materialize.ts";
import type { StudentArtifact } from "./export-types.ts";
import { declarations, gradingMethod, question } from "./declarations.ts";
import { validateGradingComponents } from "./grading-policy.ts";
import { resolve } from "node:path";
import { identity } from "./course-identity.ts";
/** Один matcher для раннего native context и окончательной сборки. */
type MenuWork = Pick<
  NonNullable<NativeAdapterValidationInput["assessment"]>,
  "id" | "slots"
>;
export function nativeUnitMenus<T extends MenuWork>(
  works: readonly MenuWork[],
  assessments: readonly T[],
): Map<string, T[]> {
  const unitMenus = new Map<string, T[]>();
  for (const work of works) {
    if (!work.id.startsWith("sec-unit-")) continue;
    const expected = "exr-" + work.id.slice("sec-unit-".length);
    const slot = work.slots?.[0];
    if (
      work.slots?.length !== 1 || slot?.selection !== "fixed" ||
      slot.id !== expected || slot.candidates?.length !== 1 ||
      slot.candidates[0] !== expected ||
      slot.assignment?.requirement !== "required"
    ) {
      throw Error(
        "PL reference-only unit не соответствует единственной задаче: " +
          work.id,
      );
    }
    const menus = assessments.filter((menu) =>
      menu.id !== work.id &&
      menu.slots.some((member) =>
        member.assignment.requirement === "optional" &&
        member.candidates.includes(expected)
      )
    );
    if (new Set(menus.map((menu) => menu.id)).size !== menus.length) {
      throw Error("PL неоднозначный источник контекста меню: " + work.id);
    }
    unitMenus.set(work.id, menus);
  }
  return unitMenus;
}
type ExportAssessment =
  & Pick<
    NonNullable<NativeAdapterValidationInput["assessment"]>,
    "id" | "title" | "kind" | "slots" | "relatedExercise"
  >
  & {
    source: string;
    extensions: {
      prairielearn: ReturnType<typeof AssessmentPolicySchema.parse>;
    };
  };
type ExportExercise =
  & Pick<NativeAdapterValidationInput["declarations"][number], "id">
  & {
    target: string;
    // Авторские значения повторно проверяет существующий question() reader.
    extensions?: {
      prairielearn?: Partial<
        Record<"topic" | "submission" | "grading" | "single-variant", unknown>
      >;
    };
  };
export interface ExportCourseContent {
  assessments: ExportAssessment[];
  exercises: ExportExercise[];
  projects?: Pick<
    CheckedNativeProjectFact,
    "exerciseId" | "bankMember" | "projectRoot" | "check"
  >[];
}
type NativeSelection = NonNullable<
  Awaited<ReturnType<typeof materializeNativeQuestion>>["selection"]
>;
/** Writer читает только имена/bytes и уже подготовленный runtime descriptor. */
export type NativeCompilerInput = Pick<NativeSelection, "descriptor"> & {
  sources: readonly Pick<
    NativeSelection["sources"][number],
    "name" | "bytes"
  >[];
  tests: readonly Pick<NativeSelection["tests"][number], "name" | "bytes">[];
};

export type CourseExportInput = {
  courseId: string;
  projectRoot: string;
  content: ExportCourseContent;
  checks: NativeCourseChecks;
  config: unknown;
  registry: {
    schemaVersion: number;
    profiles?: Record<
      string,
      Pick<RuntimeProfile, "mode"> & Partial<RuntimeProfile> & {
        image?: string;
      }
    >;
  };
  instance: string;
  output: string;
  checksOutput: string;
  body: (work: string) => Promise<PublicBodyPackage>;
  candidateImage?: string;
  deferPublish?: boolean;
  nativeBody?: boolean;
  nativeAuxiliary?: NativeAuxiliary;
  nativeInputs: Record<string, NativeCompilerInput>;
  nativeAnswers?: Record<string, AnswerFacts>;
  nativeResponseSlots?: Record<string, NativeResponseSlot[]>;
  studentArtifact: (
    fact: Pick<NativeProjectFact, "exerciseId">,
  ) => Promise<StudentArtifact>;
};
export async function planCourseExport(input: CourseExportInput) {
  const content = input.content;
  if (
    !content || !Array.isArray(content.assessments) ||
    !Array.isArray(content.exercises)
  ) {
    throw Error("PL.INPUT_INVALID: course content required");
  }
  const d = declarations(input.config, input.instance),
    out = resolve(input.output),
    privateOut = resolve(input.checksOutput);
  if (privateOut === out || privateOut.startsWith(out + "/")) {
    throw new Error("PL private checks output inside native delivery");
  }
  const works = d.instance.works.map((id: string) => {
    const work = content.assessments.find((w) => w.id === id);
    if (!work) throw new Error("PL selected work missing: " + id);
    if (!work.extensions.prairielearn) {
      throw new Error("PL selected work requires policy");
    }
    return work;
  });
  const unitMenus = nativeUnitMenus(works, content.assessments);
  const active = new Set();
  for (const w of works) {
    if (w.relatedExercise) {
      if (active.has(w.relatedExercise)) {
        throw new Error("PL duplicate active defense");
      }
      active.add(w.relatedExercise);
    }
  }
  const methods: Record<string, "external" | "manual" | "mixed"> = {};
  for (const exercise of content.exercises) {
    methods[exercise.id] = gradingMethod(
      exercise.extensions?.prairielearn?.grading ??
        d.raw["question-defaults"].grading,
    ).method;
  }
  for (const work of works) validateGradingComponents(work, methods);
  const courseUuid = await identity("course/" + input.courseId);
  const assessmentUuids = new Map<string, string>();
  const uuidOwners = new Map<string, string>();
  for (const work of works) {
    const uuid = work.extensions.prairielearn.uuid ??
      await identity("assessment/" + work.id, courseUuid);
    const previous = uuidOwners.get(uuid.toLowerCase());
    if (previous !== undefined) {
      throw Error(
        `PL.ASSESSMENT_INVALID: повторный UUID ${uuid}: ${previous} и ${work.id}`,
      );
    }
    uuidOwners.set(uuid.toLowerCase(), work.id);
    assessmentUuids.set(work.id, uuid);
  }
  return {
    input,
    content,
    d,
    out,
    privateOut,
    works,
    unitMenus,
    courseUuid,
    assessmentUuids,
  };
}
export type CourseExportPlan = Awaited<ReturnType<typeof planCourseExport>>;
