import { gradingPolicy } from "../_extensions/course-prairielearn/application/grading-policy.ts";
const assert = (v: unknown, m: string) => {
  if (!v) throw Error(m);
};
const work = () => ({
  id: "sec-lab",
  source: "tasks/lab.qmd",
  kind: "lab",
  items: ["exr-a", "exr-b"],
  assignments: {
    "exr-a": { requirement: "optional" },
    "exr-b": { requirement: "required" },
  },
  extensions: {
    prairielearn: {
      attempts: 3,
      pass: { "at-least": 1 },
      "question-points": 2.5,
      "question-max-points": 6,
      "max-points": 11,
      "grade-rate-minutes": 0,
      "advance-score-perc": 60,
      "allow-multiple-instances": false,
      "question-overrides": {
        "exr-b": {
          "question-points": 4,
          attempts: 5,
          "question-max-points": null,
        },
      },
    } as any,
  },
});
Deno.test("authored scores and retry controls preserve scalar values and per-question null/overrides", () => {
  const p = gradingPolicy(work());
  assert(
    p.questions["exr-a"].points === 2.5 &&
      p.questions["exr-a"].maxPoints === 6 &&
      p.questions["exr-a"].triesPerVariant === 3,
    "default changed",
  );
  assert(
    p.questions["exr-b"].points === 4 &&
      p.questions["exr-b"].triesPerVariant === 5 &&
      !Object.hasOwn(p.questions["exr-b"], "maxPoints"),
    "override/clear lost",
  );
  assert(
    p.assessment.maxPoints === 11 && p.assessment.gradeRateMinutes === 0 &&
      p.assessment.multipleInstance === false,
    "authored native assessment controls changed",
  );
});
Deno.test("missing explicit points fails actionable; no internal score/count ceiling or repeat default", () => {
  const w = work();
  delete w.extensions.prairielearn["question-points"];
  delete w.extensions.prairielearn["question-overrides"];
  let error = "";
  try {
    gradingPolicy(w);
  } catch (e) {
    error = String(e);
  }
  assert(
    error.includes("question-points (exr-a)") &&
      error.includes("tasks/lab.qmd#sec-lab") &&
      error.includes("assessment-defaults"),
    "missing score diagnostic not actionable",
  );
  w.extensions.prairielearn["question-points"] = 0;
  w.assignments["exr-b"].requirement = "optional";
  delete w.extensions.prairielearn["max-points"];
  delete w.extensions.prairielearn["question-max-points"];
  delete w.extensions.prairielearn["grade-rate-minutes"];
  delete w.extensions.prairielearn["allow-multiple-instances"];
  const p = gradingPolicy(w);
  assert(
    p.questions["exr-a"].points === 0 &&
      !Object.hasOwn(p.questions["exr-a"], "maxPoints") &&
      Object.keys(p.assessment).length === 0,
    "optional native defaults replaced silently",
  );
});
Deno.test("Exam accepts nonincreasing arrays, clears max; Homework rejects arrays; invalid closed fields fail", () => {
  for (
    const [field, value] of [
      ["question-points", "2"],
      ["question-points", {}],
      ["question-points", []],
      ["question-points", -1],
      ["attempts", 1.5],
      ["question-max-points", false],
      ["grade-rate-minutes", -1],
      ["advance-score-perc", 101],
      ["allow-multiple-instances", "false"],
      ["maxVariants", 2],
      ["allow-multiple-instances", true],
      ["question-overrides", null],
      ["question-overrides", { "exr-a": null }],
      ["question-overrides", { "exr-unknown": { "question-points": 1 } }],
      ["question-overrides", { "exr-a": { unknown: 1 } }],
    ] as [string, any][]
  ) {
    const w = work();
    w.extensions.prairielearn[field] = value;
    let bad = false;
    try {
      gradingPolicy(w);
    } catch {
      bad = true;
    }
    assert(bad, "invalid grading accepted " + field);
  }
  const w = work();
  w.kind = "test";
  w.extensions.prairielearn["question-points"] = [5, 3, 1];
  let bad = false;
  try {
    gradingPolicy(w);
  } catch {
    bad = true;
  }
  assert(bad, "Exam silently drops authored Homework max");
  w.extensions.prairielearn["question-max-points"] = null;
  assert(
    JSON.stringify(gradingPolicy(w).questions["exr-a"].points) === "[5,3,1]",
    "Exam list changed",
  );
  w.extensions.prairielearn["question-points"] = [1, 3];
  bad = false;
  try {
    gradingPolicy(w);
  } catch {
    bad = true;
  }
  assert(bad, "Exam increasing list accepted");
  w.kind = "lab";
  w.extensions.prairielearn["question-points"] = [3, 1];
  bad = false;
  try {
    gradingPolicy(w);
  } catch {
    bad = true;
  }
  assert(bad, "Homework point list accepted");
});

Deno.test("required zero-point questions fail closed; optional zero never supplies completion", () => {
  const w = work();
  w.assignments["exr-a"].requirement = "required";
  w.extensions.prairielearn["question-points"] = 0;
  w.extensions.prairielearn["question-max-points"] = null;
  let message = "";
  try {
    gradingPolicy(w);
  } catch (e) {
    message = String(e);
  }
  assert(
    message.includes("required questions must have positive points"),
    "required zero silently accepted",
  );
  w.assignments["exr-a"].requirement = "optional";
  assert(
    gradingPolicy(w).questions["exr-a"].points === 0,
    "optional zero with no ceiling rejected",
  );
});
