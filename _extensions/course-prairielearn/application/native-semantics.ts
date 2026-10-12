// JSON Schema does not express this pinned Community sync rule:
// PrairieLearn/PrairieLearn 92584fe, src/sync/course-db.ts:1368.
export function validateAssessmentSemantics(assessment: any, source: string) {
  if (assessment.type === "Homework" && assessment.multipleInstance === true) {
    throw new Error(
      `PL upstream semantic ${source}: Homework cannot enable multipleInstance`,
    );
  }
  for (const zone of assessment.zones) {
    if(zone.numberChoose!=null)throw new Error(`PL upstream semantic ${source}: zone subset selection is unsupported`);
    for (const question of zone.questions) {
      if(question.id!==undefined&&question.alternatives!==undefined)throw new Error(`PL upstream semantic ${source}: id and alternatives cannot coexist`);
      if(question.alternatives&&question.numberChoose!==1)throw new Error(`PL upstream semantic ${source}: alternatives require numberChoose=1`);
      // Pinned course-db.ts:1296: preferences are question-specific, never pool-wide.
      if(question.alternatives&&question.preferences!==undefined)throw new Error(`PL upstream semantic ${source}: preferences must be set on each alternative, not on the pool`);
      if(assessment.type==="Exam"&&(question.maxPoints!=null||question.maxAutoPoints!=null))throw new Error(`PL upstream semantic ${source}: Exam question cannot specify ceilings`);
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
