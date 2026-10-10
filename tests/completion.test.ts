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
  items: ["exr-a", "exr-b", "exr-c"],
  assignments: {
    "exr-a": { requirement: "required" },
    "exr-b": { requirement: "required" },
    "exr-c": { requirement: "required" },
  },
  extensions: { prairielearn: { pass: { "at-least": 2 } } },
};
function results(scores: number[]) {
  return {
    schemaVersion: 1,
    source: "per-question-results-v1",
    questions: scores.map((score, i) => ({
      questionId: "demo/" + work.items[i],
      score,
      status: "graded",
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
  w.assignments["exr-b"].requirement = "optional";
  w.assignments["exr-c"].requirement = "optional";
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
      questions: [
        results([1, 1, 0]).questions[0],
        results([1, 1, 0]).questions[0],
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
  r.questions[0].status = "ungraded";
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
import { verificationInventoryHash } from "../_extensions/course-prairielearn/application/verification-inventory.ts";
import {
  canonical,
  hash,
} from "../_extensions/course-prairielearn/application/source-selection.ts";
Deno.test("verification inventory seals every declared scenario without private payload", async () => {
  const root = await Deno.makeTempDir();
  try {
    await Deno.mkdir(root + "/project/tests", { recursive: true });
    const doc = JSON.stringify({
      schemaVersion: 1,
      cases: [{ id: "overflow" }],
    });
    await Deno.writeTextFile(root + "/project/tests/cases.json", doc);
    const checks = {
      courseId: "demo",
      projects: [{
        exerciseId: "exr-a",
        projectRoot: "project",
        references: [{ name: "default", optional: false }, {
          name: "extra",
          optional: true,
        }],
        contractCasesHash: {
          projectRelativePath: "tests/cases.json",
          sha256: await hash(doc),
        },
      }],
    };
    const expected = [{
      qualifiedId: "demo/exr-a",
      scenario: "contract:overflow",
      optional: false,
    }, {
      qualifiedId: "demo/exr-a",
      scenario: "reference:default",
      optional: false,
    }, {
      qualifiedId: "demo/exr-a",
      scenario: "reference:extra",
      optional: true,
    }, { qualifiedId: "demo/exr-a", scenario: "starter", optional: false }];
    assert(
      await verificationInventoryHash(checks, root, ["demo/exr-a"]) ===
        await hash(canonical(expected)),
      "scenario hash differs",
    );
    checks.projects[0].references.push({ name: "default", optional: false });
    let rejected = false;
    try {
      await verificationInventoryHash(checks, root, ["demo/exr-a"]);
    } catch {
      rejected = true;
    }
    assert(rejected, "duplicate scenario accepted");
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
