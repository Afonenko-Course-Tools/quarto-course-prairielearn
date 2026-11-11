import type {
  AnswerFacts,
  NativeAssignmentDeliveryOptions,
  NativeOperation,
  NativeResponseSlot,
  PublicBodyPackage,
} from "course-core/public.ts";
import {
  exportCourse,
  type ExportCourseContent,
  nativeUnitMenus,
} from "./export-course.ts";
import { createNativeAdapter } from "./native-adapter.ts";
import type { NativeEntryOptions } from "./native-entry.ts";
import {
  materializeNativeQuestion,
  nativeReferenceBindings,
} from "./native-materialize.ts";
import { nativeProjectRows } from "./native-provenance.ts";
export type NativeAdapter = ReturnType<typeof createNativeAdapter>;
export type NativeDelivered = Awaited<
  ReturnType<NativeAdapter["assignmentDelivery"]>
>;
export type RuntimeRegistry = Parameters<typeof exportCourse>[0]["registry"];
type Materialized = Awaited<ReturnType<typeof materializeNativeQuestion>>;
export type CourseArtifacts = {
  projects: NonNullable<Materialized["project"]>[];
  nativeInputs: Record<string, NonNullable<Materialized["selection"]>>;
  nativeAnswers: Record<string, AnswerFacts>;
  nativeResponseSlots: Record<string, NativeResponseSlot[]>;
  artifacts: Record<string, Materialized>;
  settings: NativeDelivered["nativeSettings"];
  bodies: Map<string, PublicBodyPackage>;
};
export function courseArtifacts(): CourseArtifacts {
  return {
    projects: [],
    nativeInputs: {},
    nativeAnswers: {},
    nativeResponseSlots: {},
    artifacts: {},
    settings: {},
    bodies: new Map(),
  };
}
/** Existing question() consumes authored names; the private normalized settings
 * are converted exactly once, without reconstructing an answer/body. */
export function authoredNativeSettings(
  value: NonNullable<NativeDelivered["nativeSettings"][string]>,
) {
  const { singleVariant, grading, submission, ...rest } = value;
  const aceMode = submission.mode === "editor" ? submission.aceMode : undefined;
  const sub = submission.mode === "editor"
    ? { mode: submission.mode }
    : submission;
  return {
    ...rest,
    submission: { ...sub, ...(aceMode ? { "ace-mode": aceMode } : {}) },
    ...(singleVariant === undefined ? {} : { "single-variant": singleVariant }),
    ...(grading
      ? { grading: grading.method === "external" ? "external" : grading }
      : {}),
  };
}
export function coursePolicies(
  adapter: NativeAdapter,
  expectedSources: string[],
  projectRows: ReturnType<typeof nativeProjectRows>,
) {
  const content: ExportCourseContent = {
    assessments: [],
    exercises: [],
    projects: projectRows.map((p) => p.fact),
  };
  const sourcePolicies = new Map(expectedSources.map((source) => [source, {
    input: adapter.validatedInput(source),
    business: adapter.business(source),
  }]));
  for (const source of expectedSources) {
    const policy = sourcePolicies.get(source);
    if (!policy) throw Error("PL.CAPTURE_MISSING: source policy");
    const value = policy.input, business = policy.business;
    if (value.assessment) {
      if (!business.assessment) {
        throw Error("PL.ASSIGNMENT_CHANGED: missing assessment policy");
      }
      content.assessments.push({
        ...value.assessment,
        source,
        extensions: { prairielearn: business.assessment },
      });
    }
    for (const declaration of value.declarations) {
      const questionSettings = business.questions[declaration.id];
      if (!questionSettings) {
        throw Error("PL.ASSIGNMENT_CHANGED: missing question policy");
      }
      content.exercises.push({
        id: declaration.id,
        target: "prairielearn",
        extensions: {
          prairielearn: authoredNativeSettings(
            questionSettings,
          ),
        },
      });
    }
  }
  return { content, sourcePolicies };
}
export async function prepareCourseMenus(input: {
  options: NativeEntryOptions;
  selection: {
    expectedSources: string[];
    assessments: { source: string; id: string }[];
  };
  content: ExportCourseContent;
  adapter: NativeAdapter;
  operation: NativeOperation;
  projectPlans: NativeAssignmentDeliveryOptions["projectPlans"];
  references: Awaited<ReturnType<typeof nativeReferenceBindings>>;
  checkpoint: () => Promise<void>;
  bodies: Map<string, PublicBodyPackage>;
}) {
  const {
    options,
    selection,
    content,
    adapter,
    operation,
    projectPlans,
    references,
    checkpoint,
    bodies,
  } = input;
  // Введение каждого реально используемого меню готово до дорогих A1 ZIP.
  // Assignment membership проверяет Core по раннему observed context intent.
  if (options.instance) {
    const selectedWorks = selection.assessments.map((a) => {
      const work = content.assessments.find((w) =>
        w.id === a.id && w.source === a.source
      );
      if (!work) {
        throw Error(
          "PL.NATIVE_INTENT_INCOMPLETE: selected work absent: " + a.id,
        );
      }
      return work;
    });
    const menus = nativeUnitMenus(selectedWorks, content.assessments);
    const needed = new Map<
      string,
      ExportCourseContent["assessments"][number]
    >();
    for (const group of menus.values()) {
      for (const menu of group) needed.set(menu.id, menu);
    }
    for (const menu of needed.values()) {
      const delivered = await adapter.assignmentDelivery(
        operation,
        {
          source: menu.source,
          assessmentId: menu.id,
        },
        { projectPlans, references: references.references },
        {
          expectedSources: selection.expectedSources,
        },
        checkpoint,
      );
      bodies.set(menu.id, delivered.publicPackage);
    }
  }
}
