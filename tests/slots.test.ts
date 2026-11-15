import { completionPolicy } from "../_extensions/course-prairielearn/application/completion.ts";
import { gradingPolicy } from "../_extensions/course-prairielearn/application/grading-policy.ts";
function assert(v: unknown, m: string): asserts v {
  if (!v) throw new Error(m);
}
Deno.test(
  "random group contributes one completion and one grading block",
  () => {
    const w = {
      id: "sec-lab",
      kind: "lab",
      slots: [
        {
          id: "alt-numbers",
          selection: "random",
          candidates: ["exr-a", "exr-b"],
          assignment: { requirement: "required", workMode: "individual" },
        },
      ],
      extensions: {
        prairielearn: {
          attempts: 3,
          "question-points": 1,
          pass: { "at-least": 1 },
        },
      },
    };
    const p = completionPolicy("demo", w);
    assert(
      p.schemaVersion === 2 &&
        p.slotIds.length === 1 &&
        p.requiredSlotIds[0] === "demo/sec-lab/alt-numbers",
      "catalog candidates counted as slots",
    );
    const points = gradingPolicy(w).slots["alt-numbers"];
    assert(
      points !== undefined && points.triesPerVariant === 3,
      "slot attempts missing",
    );
  },
);
import {
  nativeSlotBlocks,
  validateSlots,
} from "../_extensions/course-prairielearn/application/slots.ts";
import { validateAssessmentSemantics } from "../_extensions/course-prairielearn/application/native-semantics.ts";
Deno.test(
  "random native block chooses one and rejects id with alternatives or zone subsets",
  () => {
    const w = {
      id: "sec-lab",
      kind: "lab",
      slots: [
        {
          id: "alt-x",
          selection: "random",
          candidates: ["exr-a", "exr-b"],
          assignment: { requirement: "required", workMode: "individual" },
        },
      ],
      extensions: {
        prairielearn: {
          attempts: 3,
          "question-points": 1,
          pass: { "at-least": 1 },
        },
      },
    };
    const blocks = nativeSlotBlocks("demo", w, gradingPolicy(w));
    const block = blocks[0];
    assert(
      blocks.length === 1 &&
        block !== undefined &&
        block.numberChoose === 1 &&
        block.points === 1 &&
        block.alternatives.length === 2 &&
        !("id" in block),
      "one native alternative block required",
    );
    for (const value of [
      { type: "Homework", zones: [{ numberChoose: 1, questions: blocks }] },
      {
        type: "Homework",
        zones: [{ questions: [{ ...block, id: "demo/exr-a" }] }],
      },
    ]) {
      let rejected = false;
      try {
        validateAssessmentSemantics(value, "test");
      } catch {
        rejected = true;
      }
      assert(rejected, "ambiguous native selection accepted");
    }
  },
);
Deno.test(
  "pinned native pools carry preferences on eligible alternatives and preserve one priced slot",
  () => {
    for (const requirement of ["required", "optional"]) {
      const assignment = { requirement, workMode: "individual" };
      const w = {
        id: "sec-lab",
        kind: "lab",
        slots: [
          {
            id: "alt-x",
            selection: "random",
            candidates: ["exr-a", "exr-b"],
            assignment,
          },
          {
            id: "exr-c",
            selection: "fixed",
            candidates: ["exr-c"],
            assignment,
          },
        ],
        extensions: {
          prairielearn: {
            attempts: 3,
            "question-points": 2,
            "question-max-points": 6,
            pass: { "at-least": requirement === "required" ? 1 : 0 },
          },
        },
      };
      const [pool, fixed] = nativeSlotBlocks("demo", w, gradingPolicy(w));
      assert(
        pool !== undefined && pool.numberChoose === 1,
        "native pool missing",
      );
      assert(
        fixed !== undefined && fixed.preferences !== undefined,
        "fixed native question missing",
      );
      assert(
        !("preferences" in pool),
        "pinned sync forbids preferences on alternative pools",
      );
      assert(
        pool.numberChoose === 1 &&
          pool.points === 2 &&
          pool.maxPoints === 6 &&
          pool.triesPerVariant === 3 &&
          pool.alternatives.length === 2,
        "one selected slot must inherit authoritative pricing and three graded submissions",
      );
      assert(
        pool.alternatives.every(
          (alternative) =>
            alternative.preferences?.courseRequirement === requirement &&
            !("points" in alternative) &&
            !("triesPerVariant" in alternative),
        ),
        "eligible alternatives must carry question preferences while pricing remains per slot",
      );
      assert(
        fixed.id === "demo/exr-c" &&
          fixed.preferences.courseRequirement === requirement &&
          fixed.triesPerVariant === 3,
        "fixed native question preferences changed",
      );
    }
  },
);
Deno.test(
  "pinned native semantic boundary rejects pool preferences even when schema-valid",
  () => {
    for (const preferences of [{}, { courseRequirement: "required" }]) {
      let rejected = false;
      try {
        validateAssessmentSemantics(
          {
            type: "Homework",
            zones: [
              {
                questions: [
                  {
                    numberChoose: 1,
                    points: 1,
                    triesPerVariant: 3,
                    preferences,
                    alternatives: [{ id: "demo/exr-a" }, { id: "demo/exr-b" }],
                  },
                ],
              },
            ],
          },
          "pool/infoAssessment.json",
        );
      } catch (error) {
        rejected =
          String(error).includes("preferences") &&
          String(error).includes("pool/infoAssessment.json");
      }
      assert(
        rejected,
        "schema-valid pool preferences passed the pinned sync boundary",
      );
    }
  },
);
import { nativeSlotZones } from "../_extensions/course-prairielearn/application/slots.ts";
import { infoAssessment } from "../_extensions/course-prairielearn/application/native-validators.js";
Deno.test(
  "student choice emits two visible questions in one bestQuestions zone without randomness or double slot count",
  () => {
    const w = {
      id: "sec-lab",
      title: "Выбор",
      kind: "lab",
      slots: [
        {
          id: "alt-choice",
          selection: "choice",
          candidates: ["exr-a", "exr-b"],
          assignment: { requirement: "required", workMode: "individual" },
        },
      ],
      extensions: {
        prairielearn: {
          attempts: 3,
          "question-points": 2,
          pass: { "at-least": 1 },
        },
      },
    };
    const zones = nativeSlotZones("demo", w, gradingPolicy(w)),
      zone = zones[0];
    assert(zone !== undefined, "choice zone missing");
    assert(
      zones.length === 1 &&
        zone.bestQuestions === 1 &&
        zone.numberChoose === undefined &&
        zone.questions.length === 2,
      "choice became random or invisible",
    );
    assert(
      zone.questions.every(
        (q) =>
          q.points === 2 &&
          q.numberChoose === undefined &&
          q.alternatives === undefined,
      ),
      "choice weight belongs to one best candidate",
    );
    assert(
      completionPolicy("demo", w).requiredSlotIds.length === 1,
      "choice counted as two required tasks",
    );
    const assessment = {
      uuid: "99aa8f0e-f6b2-4028-9a83-ea27f18b5abe",
      type: "Homework",
      title: "Synthetic",
      set: "Homework",
      number: "1",
      zones,
    };
    assert(infoAssessment(assessment), "pinned native choice schema invalid");
    validateAssessmentSemantics(assessment, "choice/infoAssessment.json");
  },
);

Deno.test(
  "добровольные позиции видны отдельно и не меняют обязательную оценку",
  () => {
    const required = { requirement: "required", workMode: "individual" },
      optional = { requirement: "optional", workMode: "individual" };
    const w = {
      id: "sec-lab",
      title: "Массивы",
      kind: "lab",
      slots: [
        {
          id: "exr-a",
          selection: "fixed",
          candidates: ["exr-a"],
          assignment: required,
        },
        {
          id: "exr-b",
          selection: "fixed",
          candidates: ["exr-b"],
          assignment: optional,
        },
        {
          id: "exr-c",
          selection: "fixed",
          candidates: ["exr-c"],
          assignment: optional,
        },
      ],
      extensions: {
        prairielearn: {
          attempts: 3,
          pass: { "at-least": 1 },
          "slot-overrides": {
            "exr-a": { "auto-points": 80, "manual-points": 20 },
            "exr-b": { "auto-points": 0, "manual-points": 0 },
            "exr-c": { "auto-points": 0, "manual-points": 0 },
          },
        },
      },
    };
    const zones = nativeSlotZones("demo", w, gradingPolicy(w));
    const [requiredZone, optionalZone] = zones;
    assert(
      zones.length === 2 &&
        requiredZone !== undefined &&
        optionalZone !== undefined &&
        requiredZone.title === "Массивы" &&
        optionalZone.title === "Добровольные задания",
      "Добровольные задания не выделены",
    );
    assert(
      optionalZone.questions.length === 2 &&
        optionalZone.questions.every(
          (q) =>
            q.autoPoints === 0 &&
            q.manualPoints === 0 &&
            q.preferences?.courseRequirement === "optional",
        ),
      "Добровольные задачи получили зачётный вес",
    );
    assert(
      completionPolicy("demo", w).requiredSlotIds.length === 1,
      "Добровольная позиция стала обязательной",
    );
    const assessment = {
      uuid: "99aa8f0e-f6b2-4028-9a83-ea27f18b5abe",
      type: "Homework",
      title: "Массивы",
      set: "Homework",
      number: "1",
      zones,
    };
    assert(
      infoAssessment(assessment),
      "Native schema отвергает добровольный раздел",
    );
    validateAssessmentSemantics(assessment, "lab/infoAssessment.json");
  },
);
