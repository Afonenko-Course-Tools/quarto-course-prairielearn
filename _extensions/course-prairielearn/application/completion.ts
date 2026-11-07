import { createMetrics } from "../observability/bridge.ts";
import { closed, object } from "./declarations.ts";
import { qualifiedSlots } from "./slots.ts";
import type { SlotWork } from "./slots.ts";
const metrics = createMetrics("course-prairielearn");
export interface CompletionPolicy {
  schemaVersion: 2;
  mode: "required-slot-completion";
  source: "per-slot-results-v2";
  slotIds: string[];
  requiredSlotIds: string[];
  atLeast: number;
  fullyCompletedScore: 1;
}
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every((id: unknown) => typeof id === "string");
function readCompletionPolicy(value: unknown): asserts value is CompletionPolicy {
  const p = closed(value, ["schemaVersion", "mode", "source", "slotIds", "requiredSlotIds", "atLeast", "fullyCompletedScore"]);
  const ids = p.slotIds, required = p.requiredSlotIds, atLeast = p.atLeast;
  if (p.schemaVersion !== 2 || p.mode !== "required-slot-completion" || p.source !== "per-slot-results-v2" || p.fullyCompletedScore !== 1 ||
    !strings(ids) || !ids.length || ids.some((id) => !/^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*\/(exr|alt)-[a-z0-9][a-z0-9-]*$/.test(id)) || new Set(ids).size !== ids.length ||
    !strings(required) || new Set(required).size !== required.length || required.some((id) => !ids.includes(id)) ||
    typeof atLeast !== "number" || !Number.isInteger(atLeast) || atLeast < 1 || atLeast > required.length) {
    throw Error("PL.COMPLETION_INVALID: required-slot policy cannot be satisfied");
  }
}
export const validateCompletionPolicy: (p: unknown) => asserts p is CompletionPolicy = metrics.wrapSync(
  { id: "course-prairielearn.application.completion.validateCompletionPolicy", kind: "phase" }, readCompletionPolicy,
);
export const completionPolicy = metrics.wrapSync({ id: "course-prairielearn.application.completion.completionPolicy", kind: "phase" },
  function completionPolicy(courseId: string, work: SlotWork & { extensions?: unknown }): CompletionPolicy {
    const slots = qualifiedSlots(courseId, work);
    const extensions = work.extensions;
    const policy = object(extensions) ? extensions.prairielearn : undefined;
    const pass = object(policy) ? policy.pass : undefined;
    const p = {
      schemaVersion: 2, mode: "required-slot-completion", source: "per-slot-results-v2",
      slotIds: slots.map((slot) => slot.id), requiredSlotIds: slots.filter((slot) => slot.assignment.requirement === "required").map((slot) => slot.id),
      atLeast: object(pass) ? pass["at-least"] : undefined, fullyCompletedScore: 1,
    };
    validateCompletionPolicy(p);
    return p;
  });
type CompletionRow = { status: "complete" | "grading" | "unanswered"; score: number | null };
export const evaluateCompletion = metrics.wrapSync({ id: "course-prairielearn.application.completion.evaluateCompletion", kind: "phase" },
  function evaluateCompletion(policy: CompletionPolicy, value: unknown) {
    validateCompletionPolicy(policy);
    const results = closed(value, ["schemaVersion", "source", "slots"]);
    if (results.schemaVersion !== 2 || results.source !== policy.source || !Array.isArray(results.slots) || results.slots.length !== policy.slotIds.length) {
      throw Error("PL.COMPLETION_RESULTS_INVALID: exact assigned slots required");
    }
    const rows = new Map<string, CompletionRow>();
    const values: unknown[] = results.slots;
    for (const value of values) {
      const row = closed(value, ["slotId", "qualifiedId", "score", "status"]);
      const id = row.slotId, score = row.score, status = row.status;
      if (typeof id !== "string" || !policy.slotIds.includes(id) || rows.has(id) || typeof row.qualifiedId !== "string" ||
        status !== "complete" && status !== "grading" && status !== "unanswered" ||
        score !== null && (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 1)) {
        throw Error("PL.COMPLETION_RESULTS_INVALID: invalid or duplicate slot score");
      }
      rows.set(id, { score, status });
    }
    const completedRequired = policy.requiredSlotIds.filter((id) => {
      const row = rows.get(id);
      return row?.status === "complete" && row.score === 1;
    }).length;
    const passed = completedRequired >= policy.atLeast;
    return { completedRequired, requiredTotal: policy.requiredSlotIds.length, atLeast: policy.atLeast, passed, score: passed ? 1 : 0 };
  });
