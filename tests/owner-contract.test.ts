import { required } from "./fixture-values.ts";
import { strict as assert } from "node:assert";
import * as Owner from "../_extensions/course-prairielearn/application/declarations.ts";
import {
  decodeNativeBusiness,
  type NativeBusinessInput,
  validateNativeRaw,
} from "../_extensions/course-prairielearn/application/native-business.ts";
Deno.test(
  "Публичная частичная политика не выдумывает topic/submission и сохраняет overrides",
  () => {
    const partial = Owner.publicationQuestion;
    assert.equal(
      typeof partial,
      "function",
      "Один TS-канон должен покрывать partial vet и полную delivery",
    );
    assert.deepEqual(
      partial({ grading: { method: "manual" }, "single-variant": false }),
      { grading: { method: "manual" }, singleVariant: false },
    );
    assert.deepEqual(
      partial({ topic: "Явная", submission: { mode: "upload" } }),
      {
        topic: "Явная",
        submission: { mode: "upload" },
        grading: { method: "external" },
      },
    );
    for (const v of [
      { topic: "" },
      { topic: 7 },
      { unknown: true },
      { submission: { mode: "wrong" } },
      { "single-variant": "false" },
      { grading: { method: "bogus" } },
    ])
      assert.throws(() => partial(v));
    assert.throws(() =>
      Owner.question({
        grading: { method: "manual" },
        submission: { mode: "upload" },
      }),
    );
  },
);
const declarations = [
  {
    id: "exr-one",
    attributes: { "prairielearn-grading": "manual" },
  },
];
type RawFixture = {
  config: {
    "question-defaults": Record<string, unknown>;
    "assessment-defaults": Record<string, unknown>;
  };
  declarations: NativeBusinessInput["declarations"];
  assessment: unknown;
};
const raw = (): RawFixture => ({
  config: {
    "question-defaults": {
      topic: "Java",
      submission: { mode: "upload" },
      grading: { method: "manual" },
    },
    "assessment-defaults": {
      attempts: 3,
      pass: { "at-least": 1 },
      assignment: { mode: "assessment-id" },
      "auto-points": 0,
      "manual-points": 20,
    },
  },
  declarations: structuredClone(declarations),
  assessment: {},
});
const input = (): NativeBusinessInput & {
  assessment: NonNullable<NativeBusinessInput["assessment"]>;
} => ({
  origin: { source: "work.qmd" },
  course: { id: "demo" },
  declarations,
  assessment: {
    id: "sec-work",
    kind: "lab",
    slots: [
      {
        id: "exr-one",
        selection: "fixed",
        candidates: ["exr-one"],
        assignment: { requirement: "required", workMode: "individual" },
      },
    ],
  },
});
Deno.test(
  "TS-канон сохраняет inheritance, замену assignment и numeric normalization без изменения входа",
  () => {
    const r = {
      ...raw(),
      assessment: {
        attempts: "4",
        pass: { "at-least": "1" },
        assignment: { "student-label": "retake" },
      },
    };
    const before = JSON.stringify(r);
    const b = decodeNativeBusiness(r, input());
    assert.ok(b.assessment, "Авторская политика должна присутствовать");
    assert.equal(b.assessment.attempts, 4);
    assert.equal(b.assessment.pass["at-least"], 1);
    assert.deepEqual(b.assessment.assignment, { "student-label": "retake" });
    assert.equal(JSON.stringify(r), before);
    const mode = decodeNativeBusiness(raw(), input());
    assert.ok(
      mode.assessment?.assignment &&
        "student-label" in mode.assessment.assignment,
      "assessment-id должен дать действительную student-label policy",
    );
    assert.match(
      mode.assessment.assignment["student-label"],
      /^pl-[a-f0-9]{40}$/,
    );
    const same = decodeNativeBusiness(raw(), {
      ...input(),
      assessment: { ...input().assessment, id: "sec-other" },
    });
    assert.ok(
      same.assessment?.assignment &&
        "student-label" in same.assessment.assignment,
      "Вторая работа должна сохранить student-label policy",
    );
    assert.notEqual(
      mode.assessment.assignment["student-label"],
      same.assessment.assignment["student-label"],
    );
  },
);
Deno.test(
  "Старые отрицательные политики остаются исполняемыми TS отказами",
  () => {
    const assessment = { attempts: 3, pass: { "at-least": 1 } };
    const assessmentVariants: unknown[] = [
      { ...assessment, attempts: 0 },
      { ...assessment, attempts: 1.5 },
      { ...assessment, attempts: "много" },
      { ...assessment, pass: { "at-least": 0 } },
      { ...assessment, pass: { "at-least": 1.5 } },
      { ...assessment, pass: { "at-least": 2 } },
      { ...assessment, attemps: 3 },
      { ...assessment, pass: { "at-least": 1, unknown: 2 } },
      { ...assessment, assignment: { "student-label": "" } },
      false,
      [],
      { ...assessment, assignment: { mode: "other" } },
      {
        ...assessment,
        assignment: { mode: "assessment-id", "student-label": "two" },
      },
      { ...assessment, "manual-points": -1 },
    ];
    const base = { ...raw(), assessment };
    const mutants: unknown[] = [
      ...assessmentVariants.map((assessment) => ({ ...raw(), assessment })),
      { ...base, config: { ...base.config, "assessment-defaults": false } },
      {
        ...base,
        config: {
          ...base.config,
          "question-defaults": {
            ...base.config["question-defaults"],
            unknown: true,
          },
        },
      },
      {
        ...base,
        declarations: [
          {
            ...declarations[0],
            attributes: {
              ...required(declarations[0]).attributes,
              "prairielearn-submit": "upload",
            },
          },
        ],
      },
    ];
    for (const mutant of mutants) {
      assert.throws(
        () => decodeNativeBusiness(mutant, input()),
        JSON.stringify(mutant),
      );
    }
    const r = raw();
    delete r.config["assessment-defaults"].attempts;
    assert.throws(() => decodeNativeBusiness(r, input()));
    const wrong = input();
    required(wrong.assessment.slots[0]).candidates = ["exr-missing"];
    assert.throws(() => decodeNativeBusiness(raw(), wrong), /PL.SLOTS_INVALID/);
    required(wrong.assessment.slots[0]).id = "exr-missing";
    assert.throws(
      () => decodeNativeBusiness(raw(), wrong),
      /PL.ASSESSMENT_UNQUALIFIED/,
    );
  },
);
Deno.test(
  "Отсутствующая политика отличается от false/null, валидный vet не даёт delivery",
  () => {
    assert.equal(
      decodeNativeBusiness(
        { declarations: [] },
        {
          course: { id: "demo" },
          declarations: [],
        },
      ).assessment,
      undefined,
    );
    for (const v of [null, false, [], { unexpected: 1 }]) {
      assert.throws(() => validateNativeRaw({ config: v, declarations: [] }));
    }
  },
);

Deno.test(
  "Явный layout загрузки сохраняет разрешённый состав и не применяется к редактору",
  () => {
    const value = raw();
    value.config["question-defaults"].submission = {
      mode: "upload",
      layout: "files-or-zip",
    };
    const local = structuredClone(input());
    required(local.declarations[0]).attributes = {
      ...required(local.declarations[0]).attributes,
      "prairielearn-submission-layout": "zip",
    };
    value.declarations = local.declarations;
    const result = decodeNativeBusiness(value, local);
    assert.deepEqual(required(result.questions["exr-one"]).submission, {
      mode: "upload",
      layout: "zip",
    });
    for (const submission of [
      { mode: "editor", layout: "zip" },
      { mode: "workspace", layout: "zip" },
      { mode: "upload", layout: "unknown" },
    ]) {
      assert.throws(() => Owner.question({ topic: "Java", submission }));
    }
  },
);
