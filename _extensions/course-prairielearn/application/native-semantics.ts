import {createMetrics as __createMetrics} from "../observability/bridge.ts";
const __metrics=__createMetrics("course-prairielearn");
// JSON Schema does not express this pinned Community sync rule:
// PrairieLearn/PrairieLearn 92584fe, src/sync/course-db.ts:1368.
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
function validateQuestionSemantics(
  question: unknown,
  type: unknown,
  source: string,
) {
  if (
    !record(question) ||
    question.alternatives !== undefined && !Array.isArray(question.alternatives)
  ) throw Error(`PL upstream semantic ${source}: invalid alternatives`);
  if (question.id !== undefined && question.alternatives !== undefined) {
    throw new Error(
      `PL upstream semantic ${source}: id and alternatives cannot coexist`,
    );
  }
  if (question.alternatives && question.numberChoose !== 1) {
    throw new Error(
      `PL upstream semantic ${source}: alternatives require numberChoose=1`,
    );
  }
  // Pinned course-db.ts:1296: preferences are question-specific, never pool-wide.
  if (question.alternatives && question.preferences !== undefined) {
    throw new Error(
      `PL upstream semantic ${source}: preferences must be set on each alternative, not on the pool`,
    );
  }
  if (
    type === "Exam" &&
    (question.maxPoints != null || question.maxAutoPoints != null)
  ) {
    throw new Error(
      `PL upstream semantic ${source}: Exam question cannot specify ceilings`,
    );
  }
  for (const alternative of question.alternatives ?? [question]) {
    if (!record(alternative)) {
      throw Error(`PL upstream semantic ${source}: invalid alternative`);
    }
    if (
      type === "Exam" && (
        alternative.maxPoints != null || alternative.maxAutoPoints != null
      )
    ) {
      throw new Error(
        `PL upstream semantic ${source}: Exam question ${
          alternative.id ?? "pool"
        } cannot specify maxPoints or maxAutoPoints`,
      );
    }
    const points = alternative.autoPoints ?? alternative.points;
    if (
      type === "Exam" && Array.isArray(points) &&
      points.some((p: unknown, i: number) => {
        const previous: unknown = points[i - 1];
        return typeof p !== "number" || !Number.isFinite(p) ||
          i > 0 && (typeof previous !== "number" || p > previous);
      })
    ) {
      throw new Error(
        `PL upstream semantic ${source}: Exam question points must be non-increasing`,
      );
    }
    if (
      type === "Homework" &&
      (Array.isArray(points) ||
        (alternative.points === 0 &&
          typeof alternative.maxPoints === "number" &&
          alternative.maxPoints > 0))
    ) {
      throw new Error(
        `PL upstream semantic ${source}: Homework requires scalar points and forbids zero points with a positive ceiling`,
      );
    }
  }
}
function validateAssessmentSemanticsImplementation(assessment: unknown, source: string) {
  if (!record(assessment) || !Array.isArray(assessment.zones)) throw Error(`PL upstream semantic ${source}: invalid assessment zones`);
  if (assessment.type === "Homework" && assessment.multipleInstance === true) {
    throw new Error(
      `PL upstream semantic ${source}: Homework cannot enable multipleInstance`,
    );
  }
  for (const zone of assessment.zones) {
    if (!record(zone) || !Array.isArray(zone.questions)) throw Error(`PL upstream semantic ${source}: invalid zone questions`);
    if(zone.numberChoose!=null)throw new Error(`PL upstream semantic ${source}: zone subset selection is unsupported`);
    for (const question of zone.questions) {
      validateQuestionSemantics(question, assessment.type, source);
    }
  }
}

export const validateAssessmentSemantics = __metrics.wrapSync({id:"course-prairielearn.application.native-semantics.validateAssessmentSemantics",kind:"phase"},validateAssessmentSemanticsImplementation);
