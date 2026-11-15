import { required } from "./fixture-values.ts";
import type { NativeBusinessInput } from "../_extensions/course-prairielearn/application/native-business.ts";
import { gradingPolicy } from "../_extensions/course-prairielearn/application/grading-policy.ts";
function assert(v: unknown, m: string): asserts v {
  if (!v) throw Error(m);
}
Deno.test(
  "required zero-ceiling Homework fails actionable; optional zero-point zero-ceiling remains supported",
  () => {
    const w = work();
    required(w.slots[0]).assignment.requirement = "required";
    w.extensions.prairielearn["question-points"] = 1;
    w.extensions.prairielearn["question-max-points"] = 0;
    let message = "";
    try {
      gradingPolicy(w);
    } catch (e) {
      message = String(e);
    }
    assert(
      message.includes("question-max-points (exr-a)") &&
        message.includes("required question ceiling must be positive"),
      "impossible required zero-ceiling completion accepted",
    );
    required(w.slots[0]).assignment.requirement = "optional";
    w.extensions.prairielearn["question-points"] = 0;
    const native = required(gradingPolicy(w).slots["exr-a"]);
    assert(
      required(native).points === 0 && native.maxPoints === 0,
      "optional zero-ceiling policy changed",
    );
  },
);
type FixtureWork = NonNullable<NativeBusinessInput["assessment"]> & {
  source: string;
  extensions: { prairielearn: Record<string, unknown> };
};
const work = (): FixtureWork => ({
  id: "sec-lab",
  source: "tasks/lab.qmd",
  kind: "lab",
  slots: [
    {
      id: "exr-a",
      selection: "fixed",
      candidates: ["exr-a"],
      assignment: { requirement: "optional", workMode: "individual" },
    },
    {
      id: "exr-b",
      selection: "fixed",
      candidates: ["exr-b"],
      assignment: { requirement: "required", workMode: "individual" },
    },
  ],
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
      "slot-overrides": {
        "exr-b": {
          "question-points": 4,
          attempts: 5,
          "question-max-points": null,
        },
      },
    },
  },
});
Deno.test(
  "authored scores and retry controls preserve scalar values and per-question null/overrides",
  () => {
    const p = gradingPolicy(work());
    assert(
      required(p.slots["exr-a"]).points === 2.5 &&
        required(p.slots["exr-a"]).maxPoints === 6 &&
        required(p.slots["exr-a"]).triesPerVariant === 3,
      "default changed",
    );
    assert(
      required(p.slots["exr-b"]).points === 4 &&
        required(p.slots["exr-b"]).triesPerVariant === 5 &&
        !Object.hasOwn(required(p.slots["exr-b"]), "maxPoints"),
      "override/clear lost",
    );
    assert(
      p.assessment.maxPoints === 11 &&
        p.assessment.gradeRateMinutes === 0 &&
        p.assessment.multipleInstance === false,
      "authored native assessment controls changed",
    );
  },
);
Deno.test(
  "missing explicit points fails actionable; no internal score/count ceiling or repeat default",
  () => {
    const w = work();
    delete w.extensions.prairielearn["question-points"];
    delete w.extensions.prairielearn["slot-overrides"];
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
    required(w.slots[1]).assignment.requirement = "optional";
    delete w.extensions.prairielearn["max-points"];
    delete w.extensions.prairielearn["question-max-points"];
    delete w.extensions.prairielearn["grade-rate-minutes"];
    delete w.extensions.prairielearn["allow-multiple-instances"];
    const p = gradingPolicy(w);
    assert(
      required(p.slots["exr-a"]).points === 0 &&
        !Object.hasOwn(required(p.slots["exr-a"]), "maxPoints") &&
        Object.keys(p.assessment).length === 0,
      "optional native defaults replaced silently",
    );
  },
);
Deno.test(
  "Exam accepts nonincreasing arrays, clears max; Homework rejects arrays; invalid closed fields fail",
  () => {
    for (const [field, value] of [
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
      ["slot-overrides", null],
      ["slot-overrides", { "exr-a": null }],
      ["slot-overrides", { "exr-unknown": { "question-points": 1 } }],
      ["slot-overrides", { "exr-a": { unknown: 1 } }],
    ] satisfies [string, unknown][]) {
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
      JSON.stringify(required(gradingPolicy(w).slots["exr-a"]).points) ===
        "[5,3,1]",
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
  },
);

Deno.test(
  "required zero-point questions fail closed; optional zero never supplies completion",
  () => {
    const w = work();
    required(w.slots[0]).assignment.requirement = "required";
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
    required(w.slots[0]).assignment.requirement = "optional";
    assert(
      required(gradingPolicy(w).slots["exr-a"]).points === 0,
      "optional zero with no ceiling rejected",
    );
  },
);

import {
  decodeNativeBusiness,
  validateNativeRaw,
} from "../_extensions/course-prairielearn/application/native-business.ts";

Deno.test(
  "Локальный native UUID проходит business contract при переименовании assessment",
  () => {
    const uuid = "6cbeb308-b0c5-51fc-bc0e-0f6bcbe75a45";
    for (const id of ["sec-lab", "sec-renamed"]) {
      const assessment = work();
      assessment.id = id;
      const raw = {
        config: {
          "assessment-defaults": {
            attempts: 3,
            pass: { "at-least": 1 },
            "question-points": 2,
          },
        },
        assessment: { uuid, assignment: { mode: "assessment-id" } },
        declarations: [],
      };
      const decoded = decodeNativeBusiness(
        raw,
        {
          course: { id: "demo" },
          assessment,
          declarations: [],
        },
        { deferComposition: true },
      );
      assert(
        decoded.assessment !== undefined,
        "Авторская политика должна присутствовать",
      );
      assert(
        decoded.assessment.uuid === uuid,
        "Native business потерял явную identity",
      );
      gradingPolicy({
        ...assessment,
        extensions: { prairielearn: decoded.assessment },
      });
    }
  },
);

Deno.test(
  "Native UUID запрещён в defaults и неверный локальный UUID отвергается",
  () => {
    const assessment = work();
    for (const uuid of [
      null,
      false,
      42,
      "",
      "not-a-uuid",
      "6cbeb308b0c551fcbc0e0f6bcbe75a45",
      "6cbeb308-b0c5-51fc-bc0e-0f6bcbe75a45\n",
    ]) {
      let message = "";
      try {
        decodeNativeBusiness(
          {
            assessment: {
              ...assessment.extensions.prairielearn,
              uuid,
              assignment: { mode: "assessment-id" },
            },
            declarations: [],
          },
          { course: { id: "demo" }, assessment, declarations: [] },
          { deferComposition: true },
        );
      } catch (error) {
        message = String(error);
      }
      assert(
        message.includes("uuid"),
        "Неверный UUID прошёл native business contract",
      );
    }
    let message = "";
    try {
      validateNativeRaw({
        config: {
          "assessment-defaults": {
            uuid: "6cbeb308-b0c5-51fc-bc0e-0f6bcbe75a45",
          },
        },
        declarations: [],
      });
    } catch (error) {
      message = String(error);
    }
    assert(
      message.includes("uuid"),
      "Один UUID допускается для всех работ через defaults",
    );
  },
);

import { validateGradingComponents } from "../_extensions/course-prairielearn/application/grading-policy.ts";
Deno.test(
  "добровольные mixed и manual сохраняют проверку без зачётного веса",
  () => {
    const w = work();
    w.extensions.prairielearn["question-points"] = undefined;
    delete w.extensions.prairielearn["question-points"];
    delete w.extensions.prairielearn["question-max-points"];
    w.extensions.prairielearn["slot-overrides"] = {
      "exr-a": { "auto-points": 0, "manual-points": 0 },
      "exr-b": { "auto-points": 80, "manual-points": 20 },
    };
    for (const method of ["mixed", "manual", "external"] as const) {
      const policy = validateGradingComponents(w, {
        "exr-a": method,
        "exr-b": "mixed",
      });
      assert(
        required(policy.slots["exr-a"]).autoPoints === 0 &&
          required(policy.slots["exr-a"]).manualPoints === 0,
        "Добровольная задача изменила обязательный вес",
      );
      assert(
        required(policy.slots["exr-b"]).autoPoints === 80 &&
          required(policy.slots["exr-b"]).manualPoints === 20,
        "Обязательные 80/20 изменены",
      );
    }
    required(w.slots[0]).assignment.requirement = "required";
    let rejected = false;
    try {
      gradingPolicy(w);
    } catch {
      rejected = true;
    }
    assert(rejected, "Обязательная позиция потеряла положительный вес");
  },
);

Deno.test(
  "настоящая native business граница принимает добровольные нулевые компоненты",
  () => {
    const assessment = work();
    const policy = {
      attempts: 3,
      pass: { "at-least": 1 },
      assignment: { mode: "assessment-id" },
      "slot-overrides": {
        "exr-a": { "auto-points": 0, "manual-points": 0 },
        "exr-b": { "auto-points": 80, "manual-points": 20 },
      },
    };
    const decoded = decodeNativeBusiness(
      { assessment: policy, declarations: [] },
      { course: { id: "demo" }, assessment, declarations: [] },
      { deferComposition: true },
    );
    const native = gradingPolicy({
      ...assessment,
      extensions: { prairielearn: decoded.assessment },
    });
    assert(
      required(native.slots["exr-a"]).autoPoints === 0 &&
        required(native.slots["exr-b"]).manualPoints === 20,
      "Native decoder изменил обязательные или добровольные компоненты",
    );
  },
);
