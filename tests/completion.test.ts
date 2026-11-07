import { required } from "./fixture-values.ts";
import {
  completionPolicy,
  evaluateCompletion,
} from "../_extensions/course-prairielearn/application/completion.ts";
import { normalizeDiscovery } from "../_extensions/course-prairielearn/application/grading-descriptor.ts";
const assert = (v: unknown, m: string) => {
  if (!v) throw new Error(m);
};
const work = {
  id: "sec-lab",
  slots: ["exr-a", "exr-b", "exr-c"].map((id) => ({
    id,
    selection: "fixed",
    candidates: [id],
    assignment: { requirement: "required", workMode: "individual" },
  })),
  extensions: { prairielearn: { pass: { "at-least": 2 } } },
};
function results(scores: number[]) {
  return {
    schemaVersion: 2,
    source: "per-slot-results-v2",
    slots: scores.map((score, i) => ({
      slotId: "demo/sec-lab/" + required(work.slots[i], "result slot").id,
      qualifiedId: "demo/" + required(work.slots[i], "result slot").id,
      score,
      status: "complete",
    })),
  };
}
Deno.test("partial weighted scores reaching native point threshold never complete required tasks", () => {
  const policy = completionPolicy("demo", work);
  const r = evaluateCompletion(policy, results([.7, .7, .7]));
  assert(
    !r.passed && r.completedRequired === 0 && r.score === 0,
    "partial sum passed",
  );
  assert(
    evaluateCompletion(policy, results([1, 1, .7])).passed,
    "two complete required fail",
  );
});
Deno.test("optional completions cannot replace required pool and impossible threshold rejected", () => {
  const w = structuredClone(work);
  required(w.slots[1], "second slot").assignment.requirement = "optional";
  required(w.slots[2], "third slot").assignment.requirement = "optional";
  w.extensions.prairielearn.pass["at-least"] = 1;
  assert(
    !evaluateCompletion(completionPolicy("demo", w), results([0, 1, 1])).passed,
    "optionals passed work",
  );
  w.extensions.prairielearn.pass["at-least"] = 2;
  let rejected = false;
  try {
    completionPolicy("demo", w);
  } catch {
    rejected = true;
  }
  assert(rejected, "unachievable required policy accepted");
});
Deno.test("aggregate absent duplicate invalid and ungraded result paths fail closed", () => {
  const p = completionPolicy("demo", work);
  for (
    const r of [{ score: 1 }, results([1]), {
      ...results([1, 1, 0]),
      slots: [
        results([1, 1, 0]).slots[0],
        results([1, 1, 0]).slots[0],
      ],
    }, results([1.1, 1, 0])]
  ) {
    let rejected = false;
    try {
      evaluateCompletion(p, r);
    } catch {
      rejected = true;
    }
    assert(rejected, "unsupported results accepted");
  }
  const r = results([1, 1, 0]);
  required(r.slots[0], "first result").status = "unanswered";
  assert(!evaluateCompletion(p, r).passed, "ungraded counted");
});
Deno.test("partial discovery defaults are identical for each single key and empty map", () => {
  assert(
    JSON.stringify(normalizeDiscovery({ "min-executed": 2 })) ===
      JSON.stringify({ "min-executed": 2, "allow-skipped": false }),
    "min only",
  );
  assert(
    JSON.stringify(normalizeDiscovery({ "allow-skipped": true })) ===
      JSON.stringify({ "min-executed": 1, "allow-skipped": true }),
    "skip only",
  );
  assert(
    JSON.stringify(normalizeDiscovery({})) ===
      JSON.stringify({ "min-executed": 1, "allow-skipped": false }),
    "empty",
  );
});
