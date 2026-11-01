import { strict as assert } from "node:assert";
import * as Owner from "../_extensions/course-prairielearn/application/declarations.ts";
import {
  decodeNativeBusiness,
  validateNativeRaw,
} from "../_extensions/course-prairielearn/application/native-business.ts";
Deno.test("Публичная частичная политика не выдумывает topic/submission и сохраняет overrides", () => {
  const partial = (Owner as any).publicationQuestion;
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
  for (
    const v of [
      { topic: "" },
      { topic: 7 },
      { unknown: true },
      { submission: { mode: "wrong" } },
      { "single-variant": "false" },
      { grading: { method: "bogus" } },
    ]
  ) assert.throws(() => partial(v));
  assert.throws(() =>
    Owner.question({
      grading: { method: "manual" },
      submission: { mode: "upload" },
    })
  );
});
const declarations = [{
  id: "exr-one",
  attributes: { "prairielearn-grading": "manual" },
}];
const raw = () => ({
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
const input = () => ({
  origin: { source: "work.qmd" },
  course: { id: "demo" },
  declarations,
  assessment: {
    id: "sec-work",
    kind: "lab",
    slots: [{
      id: "exr-one",
      selection: "fixed",
      candidates: ["exr-one"],
      assignment: { requirement: "required", workMode: "individual" },
    }],
  },
});
Deno.test("TS-канон сохраняет inheritance, замену assignment и numeric normalization без изменения входа", () => {
  const r: any = raw();
  r.assessment = {
    attempts: "4",
    pass: { "at-least": "1" },
    assignment: { "student-label": "retake" },
  };
  const before = JSON.stringify(r);
  const b = decodeNativeBusiness(r, input());
  assert.equal(b.assessment.attempts, 4);
  assert.equal(b.assessment.pass["at-least"], 1);
  assert.deepEqual(b.assessment.assignment, { "student-label": "retake" });
  assert.equal(JSON.stringify(r), before);
  const mode = decodeNativeBusiness(raw(), input());
  assert.match(
    mode.assessment.assignment["student-label"],
    /^pl-[a-f0-9]{40}$/,
  );
  const same = decodeNativeBusiness(raw(), {
    ...input(),
    assessment: { ...input().assessment, id: "sec-other" },
  });
  assert.notEqual(
    mode.assessment.assignment["student-label"],
    same.assessment.assignment["student-label"],
  );
});
Deno.test("Старые отрицательные политики остаются исполняемыми TS отказами", () => {
  const mutants = [
    (r: any) => r.assessment.attempts = 0,
    (r: any) => r.assessment.attempts = 1.5,
    (r: any) => r.assessment.attempts = "много",
    (r: any) => r.assessment.pass = { "at-least": 0 },
    (r: any) => r.assessment.pass = { "at-least": 1.5 },
    (r: any) => r.assessment.pass = { "at-least": 2 },
    (r: any) => r.assessment.attemps = 3,
    (r: any) => r.assessment.pass = { "at-least": 1, unknown: 2 },
    (r: any) => r.assessment.assignment = { "student-label": "" },
    (r: any) => r.assessment = false,
    (r: any) => r.assessment = [],
    (r: any) => r.config["assessment-defaults"] = false,
    (r: any) => r.config["question-defaults"].unknown = true,
    (r: any) => r.declarations[0].attributes["prairielearn-submit"] = "upload",
    (r: any) => r.assessment.assignment = { mode: "other" },
    (r: any) =>
      r.assessment.assignment = {
        mode: "assessment-id",
        "student-label": "two",
      },
    (r: any) => r.assessment["manual-points"] = -1,
  ];
  for (const mutate of mutants) {
    const r: any = raw();
    r.assessment = { attempts: 3, pass: { "at-least": 1 } };
    mutate(r);
    assert.throws(() => decodeNativeBusiness(r, input()), String(mutate));
  }
  const r: any = raw();
  delete r.config["assessment-defaults"].attempts;
  assert.throws(() => decodeNativeBusiness(r, input()));
  const wrong = input();
  wrong.assessment.slots[0].candidates = ["exr-missing"];
  assert.throws(
    () => decodeNativeBusiness(raw(), wrong),
    /PL.ASSESSMENT_UNQUALIFIED/,
  );
});
Deno.test("Отсутствующая политика отличается от false/null, валидный vet не даёт delivery", () => {
  assert.equal(
    decodeNativeBusiness({ declarations: [] }, {
      course: { id: "demo" },
      declarations: [],
    }).assessment,
    undefined,
  );
  for (const v of [null, false, [], { unexpected: 1 }]) {
    assert.throws(() => validateNativeRaw({ config: v, declarations: [] }));
  }
});
