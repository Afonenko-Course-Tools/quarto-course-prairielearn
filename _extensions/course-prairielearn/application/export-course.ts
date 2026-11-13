import { assertIntegerCourseMaxima } from "./native-course-options.ts";
import { dirname, join } from "node:path";
import { CourseArtifacts, inventoryNames } from "./course-artifacts.ts";
import { CourseOverviews } from "./course-overview.ts";
import { planSelectedExport } from "./selected-export-plan.ts";
import {
  QuestionArtifactReuse,
  questionArtifacts,
} from "./question-artifacts.ts";
import {
  type CourseExportInput,
  planCourseExport,
} from "./course-export-plan.ts";
import {
  type CourseQuestionDeliveries,
  courseQuestionInput,
} from "./course-question-input.ts";
import { OwnedExportOutput } from "./export-output.ts";
import { identity } from "./course-identity.ts";
export { identity } from "./course-identity.ts";
export { nativeUnitMenus } from "./course-export-plan.ts";
export type {
  ExportCourseContent,
  NativeCompilerInput,
} from "./course-export-plan.ts";
import { nativeSlotZones, qualifiedSlots } from "./slots.ts";
import { gradingPolicy } from "./grading-policy.ts";
import { completionPolicy } from "./completion.ts";
import { createMetrics as __createMetrics } from "../observability/bridge.ts";
const __metrics = __createMetrics("course-prairielearn");
async function buildCourse(input: CourseExportInput) {
  const plan = await planCourseExport(input);
  const { d, out, privateOut, works, courseUuid, assessmentUuids } = plan;
  const owned = await OwnedExportOutput.create(
    out,
    input.nativeAuxiliary?.environment,
    privateOut,
  );
  const stage = owned.stage;
  const writer = new CourseArtifacts(plan, owned),
    overviews = new CourseOverviews(plan, owned);
  try {
    const scratch = await owned.scratchDirectory();
    if (d.course.options?.integerManualPoints === true) {
      for (const work of works)
        assertIntegerCourseMaxima(
          gradingPolicy(work),
          `${work.source ?? "course"}#${work.id}`,
        );
    }
    await writer.write("infoCourse.json", {
      uuid: courseUuid,
      name: d.course.name,
      title: d.course.title,
      timezone: d.course.timezone,
      topics: d.course.topics,
      ...(d.course.options === undefined ? {} : { options: d.course.options }),
    });
    await writer.write(
      "courseInstances/" + input.instance + "/infoCourseInstance.json",
      {
        uuid: await identity("instance/" + input.instance, courseUuid),
        longName: d.instance.title,
        studentLabels: await Promise.all(
          [
            ...new Set(
              works
                .filter((w) => w.relatedExercise)
                .map((w) =>
                  ((assignment) =>
                    assignment && "student-label" in assignment
                      ? assignment["student-label"]
                      : undefined)(w.extensions.prairielearn.assignment),
                ),
            ),
          ].map(async (name) => {
            if (typeof name !== "string" || !name) {
              throw new Error("PL resolved assignment label required");
            }
            return {
              name,
              color: "blue2",
              uuid: await identity(
                "student-label/" + input.instance + "/" + name,
                courseUuid,
              ),
            };
          }),
        ),
        timezone: d.course.timezone,
        selfEnrollment: { enabled: d.instance["self-enrollment"] },
        publishing: {
          startDate: d.instance.publishing["start-date"],
          endDate: d.instance.publishing["end-date"],
        },
      },
    );
    const questions: CourseQuestionDeliveries = {};
    const reuse = new QuestionArtifactReuse();
    for (const [index, work] of works.entries()) {
      const p = await input.body(work.id);
      const {
        binding,
        projects,
        studentArtifacts,
        questions: deliveries,
      } = await courseQuestionInput(plan, p, scratch);
      Object.assign(questions, deliveries);
      const overview = await overviews.render(work, p);
      const partial = join(scratch, "work-" + index);
      const selected = await planSelectedExport(
        p,
        {
          projectRoot: scratch,
          nativeBody: input.nativeBody,
          nativeAuxiliary: input.nativeAuxiliary,
          projects,
          studentArtifacts,
          nativeAnswers: input.nativeAnswers,
        },
        binding,
      );
      const identities = Object.fromEntries(
        p.questions.map((q) => [
          q.key,
          {
            delivery: deliveries[q.key],
            project: input.checks.projects.find((f) => f.exerciseId === q.id),
            selection: input.nativeInputs[q.id],
            responseSlots: input.nativeResponseSlots?.[q.id],
          },
        ]),
      );
      const artifacts = await questionArtifacts(selected, {
        reuse,
        identities,
      });
      for (const file of artifacts.files) {
        const path = join(partial, file.name);
        await Deno.mkdir(dirname(path), { recursive: true });
        await Deno.writeFile(path, file.data);
      }
      await writer.importQuestions(p, binding, deliveries, partial);
      const policy = work.extensions.prairielearn;
      const grading = gradingPolicy(work);
      const assessmentType = ["test", "practical"].includes(work.kind)
        ? "Exam"
        : "Homework";
      await writer.write(
        "courseInstances/" +
          input.instance +
          "/assessments/" +
          work.id +
          "/infoAssessment.json",
        {
          uuid: assessmentUuids.get(work.id),
          type: assessmentType,
          title: work.title,
          set: assessmentType,
          number: String(index + 1),
          ...grading.assessment,
          text: overview.html,
          accessControl: (work.relatedExercise
            ? [
                {
                  beforeRelease: { listed: false },
                  dateControl: {
                    release: { date: "9999-12-31T00:00:00" },
                    due: { date: null },
                  },
                },
                {
                  uuid: await identity(
                    "access/" + input.instance + "/" + work.id,
                    courseUuid,
                  ),
                  labels: [
                    policy.assignment && "student-label" in policy.assignment
                      ? policy.assignment["student-label"]
                      : undefined,
                  ],
                  dateControl: {
                    release: { date: "1970-01-01T00:00:00" },
                    due: { date: null },
                  },
                },
              ]
            : [
                {
                  dateControl: {
                    release: { date: "1970-01-01T00:00:00" },
                    due: { date: null },
                  },
                },
              ]
          ).map((rule) =>
            work.kind === "lab"
              ? {
                  ...rule,
                  afterComplete: {
                    questions: { hidden: false },
                    score: { hidden: false },
                  },
                }
              : rule,
          ),
          zones: nativeSlotZones(input.courseId, work, grading),
        },
      );
    }
    const files = await inventoryNames(stage);
    const version = 5;
    {
      for (const [key, value] of Object.entries(questions)) {
        if (value.kind === "native-answer") continue;
        if (value.submission.mode === "workspace") {
          const prefix = "questions/" + key + "/workspace/.pl-seed/";
          if (
            !files.includes(prefix + "starter.zip") ||
            !files.includes(prefix + "manifest.json")
          )
            throw Error("PL.WORKSPACE_SEED_REQUIRED");
          questions[key] = {
            ...value,
            kind: "workspace",
            upstreamGradingMethod: "Manual",
            singleVariant: true,
            seed: {
              schema: "pl-git-workspace-seed-v1",
              archive: "workspace/.pl-seed/starter.zip",
              manifest: "workspace/.pl-seed/manifest.json",
            },
          };
        } else questions[key] = { ...value, kind: "project" };
      }
    }
    const delivery = {
      schemaVersion: version,
      courseId: input.courseId,
      bookRoot: input.checks.bookRoot,
      questions: Object.keys(questions).sort(),
      gradingPayloads: questions,
      works: works.map((w) => ({
        id: w.id,
        slots: qualifiedSlots(input.courseId, w),
        policy: Object.fromEntries(
          Object.entries(w.extensions.prairielearn).filter(
            ([key]) => w.relatedExercise || key !== "assignment",
          ),
        ),
        completion: completionPolicy(input.courseId, w),
        ...(w.relatedExercise ? { relatedExercise: w.relatedExercise } : {}),
      })),
      instances: {
        [input.instance]: {
          works: d.instance.works,
          selfEnrollment: d.instance["self-enrollment"],
        },
      },
      files: files.sort(),
      ...(input.candidateImage ? { candidate: true } : {}),
    };
    await writer.write("delivery.json", delivery);
    await owned.preparePrivate(input.checks);
    await owned.releaseScratch();
    const publish = async () => {
      await owned.publish();
      return delivery;
    };
    if (input.deferPublish) {
      return {
        delivery,
        publish,
        discard: () => owned.discard(),
      };
    }
    return await publish();
  } catch (error) {
    await owned.discardAfterFailure();
    throw error;
  }
}
const observedCourseExport = __metrics.wrapAsync(
  {
    id: "course-prairielearn.application.export-course.exportCourse",
    kind: "phase",
  },
  buildCourse,
);
type CourseExportResult = Awaited<ReturnType<typeof buildCourse>>;
type PreparedCourseExport = Extract<CourseExportResult, { publish: unknown }>;
type PublishedCourseExport = Exclude<CourseExportResult, { publish: unknown }>;
/** Режим публикации определяет настоящий результат того же writer. */
export function exportCourse(
  input: CourseExportInput & { deferPublish: true },
): Promise<PreparedCourseExport>;
export function exportCourse(
  input: CourseExportInput & { deferPublish?: false | undefined },
): Promise<PublishedCourseExport>;
export function exportCourse(
  input: CourseExportInput,
): Promise<CourseExportResult>;
export async function exportCourse(
  input: CourseExportInput,
): Promise<CourseExportResult> {
  return await observedCourseExport(input);
}
