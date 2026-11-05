import assert from "node:assert/strict";
import * as Core from "course-core/public.ts";
import {
  nativeBusinessInput,
  parsedNativeBusinessInput,
} from "../_extensions/course-prairielearn/application/native-input.ts";
import { decodeNativeBusiness } from "../_extensions/course-prairielearn/application/native-business.ts";

function fixture() {
  return {
    origin: {
      operation: crypto.randomUUID(),
      captureWitness: crypto.randomUUID(),
      source: "labs/work.qmd",
      format: "html",
      projection: "student",
      profiles: [],
    },
    course: { id: "metadata-course", adapters: ["prairielearn"] },
    nativeMetadata: {
      configuration: {
        "question-defaults": {
          topic: "Git",
          grading: { method: "manual" },
          submission: { mode: "upload" },
        },
        "assessment-defaults": { assignment: { mode: "assessment-id" } },
      },
      assessment: {
        attempts: "1",
        pass: { "at-least": "1" },
        "auto-points": "0",
        "manual-points": "100",
      },
      projectChecks: { "source-profiles": {}, profiles: {} },
      projectMaterialization: {
        projects: {
          "exr-repo": {
            "include-git": true,
            "common-files": [{
              source: "/common/tool.fish",
              target: "student/tools/tool.fish",
              audience: "student",
            }],
          },
        },
      },
    },
    declarations: [{
      id: "exr-repo",
      attributes: { project: "/projects/repo" },
    }],
    assessment: {
      id: "work",
      title: "Работа",
      kind: "lab",
      slots: [{
        id: "exr-repo",
        selection: "fixed",
        candidates: ["exr-repo"],
        assignment: { requirement: "required", workMode: "individual" },
      }],
      memberContainers: 1,
      memberKinds: ["BulletList"],
      memberSizes: [1],
    },
  };
}

Deno.test("Прямая карта Core сохраняет все четыре PL business плоскости", () => {
  const value = fixture(), before = structuredClone(value);
  const { input, raw } = nativeBusinessInput(Core, value);
  assert.deepEqual(raw, {
    config: before.nativeMetadata.configuration,
    assessment: before.nativeMetadata.assessment,
    projectChecks: before.nativeMetadata.projectChecks,
    materialization: before.nativeMetadata.projectMaterialization,
    declarations: before.declarations,
  });
  const business = decodeNativeBusiness(raw, input);
  assert.equal(business.questions["exr-repo"].topic, "Git");
  assert.equal(business.questions["exr-repo"].grading.method, "manual");
  assert.equal(business.assessment?.attempts, 1);
  assert.equal(business.assessment?.pass["at-least"], 1);
  assert.equal(
    business.materialization?.projects["exr-repo"]["common-files"][0].source,
    "common/tool.fish",
  );
  assert.equal(business.materialization?.projects["exr-repo"]["include-git"], true);
  assert.deepEqual(value, before);
});

Deno.test("Пустая карта означает отсутствие policy без выдуманных полей", () => {
  const { input, raw } = nativeBusinessInput(Core, {
    ...fixture(),
    nativeMetadata: {},
    declarations: [],
  });
  assert.deepEqual(raw, { declarations: [] });
  assert.deepEqual(parsedNativeBusinessInput(input).raw, { declarations: [] });
});

Deno.test("Unknown input отвергает отсутствующую карту, чужие slots и старый envelope", () => {
  for (const nativeMetadata of [
    undefined,
    { foreign: {} },
    { configuration: {}, foreign: {} },
    { readSet: ["configuration"], values: {} },
  ]) {
    assert.throws(() => nativeBusinessInput(Core, { ...fixture(), nativeMetadata }));
  }
});

Deno.test("PL raw получает только answer marker и собственную копию attributes", () => {
  const { input, raw } = nativeBusinessInput(Core, {
    ...fixture(),
    nativeMetadata: {},
    declarations: [{
      id: "exr-answer",
      attributes: { "prairielearn-topic": "Ответ" },
      answer: { type: "numeric", key: { value: 431, tolerance: { absolute: 0 } } },
    }],
  });
  assert.deepEqual(raw.declarations, [{
    id: "exr-answer",
    attributes: { "prairielearn-topic": "Ответ" },
    answer: true,
  }]);
  assert.equal(input.declarations[0].answer?.type, "numeric");
  assert(!JSON.stringify(raw).includes("431"));
  input.declarations[0].attributes["prairielearn-topic"] = "Изменено";
  assert(!JSON.stringify(raw).includes("Изменено"));
});
