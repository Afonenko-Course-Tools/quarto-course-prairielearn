// JSON Schema does not express this pinned Community sync rule:
// PrairieLearn/PrairieLearn 92584fe, src/sync/course-db.ts:1368.
export function validateAssessmentSemantics(assessment: any, source: string) {
  if (assessment.type === "Homework" && assessment.multipleInstance === true) {
    throw new Error(
      `PL upstream semantic ${source}: Homework cannot enable multipleInstance`,
    );
  }
  for (const zone of assessment.zones) {
    for (const question of zone.questions) {
      for (const alternative of question.alternatives ?? [question]) {
        if (
          assessment.type === "Exam" && (
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
          assessment.type === "Exam" && Array.isArray(points) &&
          points.some((p: number, i: number) => i > 0 && p > points[i - 1])
        ) {
          throw new Error(
            `PL upstream semantic ${source}: Exam question points must be non-increasing`,
          );
        }
        if (
          assessment.type === "Homework" &&
          (Array.isArray(points) ||
            (alternative.points === 0 && alternative.maxPoints > 0))
        ) {
          throw new Error(
            `PL upstream semantic ${source}: Homework requires scalar points and forbids zero points with a positive ceiling`,
          );
        }
      }
    }
  }
}
