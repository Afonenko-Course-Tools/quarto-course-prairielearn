import { closed } from "./declarations.ts";
export interface CompletionPolicy {
  schemaVersion: 1;
  mode: "required-question-completion";
  source: "per-question-results-v1";
  questionIds: string[];
  requiredQuestionIds: string[];
  atLeast: number;
  fullyCompletedScore: 1;
}
const qualified = (id: unknown) =>
  typeof id === "string" &&
  /^[a-z][a-z0-9-]*\/exr-[a-z0-9][a-z0-9-]*$/.test(id);
export function validateCompletionPolicy(
  p: any,
): asserts p is CompletionPolicy {
  closed(p, [
    "schemaVersion",
    "mode",
    "source",
    "questionIds",
    "requiredQuestionIds",
    "atLeast",
    "fullyCompletedScore",
  ]);
  if (
    p.schemaVersion !== 1 || p.mode !== "required-question-completion" ||
    p.source !== "per-question-results-v1" || p.fullyCompletedScore !== 1 ||
    !Array.isArray(p.questionIds) || !p.questionIds.length ||
    p.questionIds.some((id: any) => !qualified(id)) ||
    new Set(p.questionIds).size !== p.questionIds.length ||
    !Array.isArray(p.requiredQuestionIds) ||
    new Set(p.requiredQuestionIds).size !== p.requiredQuestionIds.length ||
    p.requiredQuestionIds.some((id: any) => !p.questionIds.includes(id)) ||
    !Number.isInteger(p.atLeast) || p.atLeast < 1 ||
    p.atLeast > p.requiredQuestionIds.length
  ) {
    throw new Error(
      "PL.COMPLETION_INVALID: closed required-question policy cannot be satisfied",
    );
  }
}
export function completionPolicy(
  courseId: string,
  work: any,
): CompletionPolicy {
  if (
    !Array.isArray(work.items) || !work.items.length ||
    new Set(work.items).size !== work.items.length || !work.assignments ||
    Object.keys(work.assignments).length !== work.items.length ||
    work.items.some((id: string) =>
      !["required", "optional"].includes(work.assignments[id]?.requirement)
    )
  ) throw new Error("PL.COMPLETION_INVALID: exact assignment facts required");
  const policy: CompletionPolicy = {
    schemaVersion: 1,
    mode: "required-question-completion",
    source: "per-question-results-v1",
    questionIds: work.items.map((id: string) => courseId + "/" + id),
    requiredQuestionIds: work.items.filter((id: string) =>
      work.assignments[id].requirement === "required"
    ).map((id: string) => courseId + "/" + id),
    atLeast: work.extensions?.prairielearn?.pass?.["at-least"],
    fullyCompletedScore: 1,
  };
  validateCompletionPolicy(policy);
  return policy;
}
/** Identity, delivery version and bridge authentication must be checked by the caller first. Aggregate grades are never accepted. */
export function evaluateCompletion(policy: CompletionPolicy, results: any) {
  validateCompletionPolicy(policy);
  closed(results, ["schemaVersion", "source", "questions"]);
  if (
    results.schemaVersion !== 1 || results.source !== policy.source ||
    !Array.isArray(results.questions) ||
    results.questions.length !== policy.questionIds.length
  ) {
    throw new Error(
      "PL.COMPLETION_RESULTS_INVALID: exact per-question bridge rows required",
    );
  }
  const rows = new Map<string, any>();
  for (const row of results.questions) {
    closed(row, ["questionId", "score", "status"]);
    if (
      !policy.questionIds.includes(row.questionId) ||
      rows.has(row.questionId) ||
      !["graded", "ungraded"].includes(row.status) ||
      typeof row.score !== "number" || !Number.isFinite(row.score) ||
      row.score < 0 || row.score > 1
    ) {
      throw new Error(
        "PL.COMPLETION_RESULTS_INVALID: invalid or duplicate question score",
      );
    }
    rows.set(row.questionId, row);
  }
  const completedRequired =
    policy.requiredQuestionIds.filter((id) =>
      rows.get(id)?.status === "graded" && rows.get(id).score === 1
    ).length;
  const passed = completedRequired >= policy.atLeast;
  return {
    completedRequired,
    requiredTotal: policy.requiredQuestionIds.length,
    atLeast: policy.atLeast,
    passed,
    score: passed ? 1 : 0,
  };
}
