import { required, setFixture, deleteFixture, record, string, array, fixtureAt } from "./fixture-values.ts";
import type { PublicBodyPackage } from "course-core/body-export/model.ts";
import { exportCourse } from "../_extensions/course-prairielearn/application/export-course.ts";
import { publicProjectFiles } from "../_extensions/course-prairielearn/application/export.ts";
import { NativeProjectCheckSchema } from "../_extensions/course-prairielearn/application/native-checks.ts";
import { runtimeDescriptor } from "../_extensions/course-prairielearn/application/runtime-descriptor.ts";
import { selectedCheckFile } from "../_extensions/course-prairielearn/application/native-check-inventory.ts";
function assert(v: unknown, m: string): asserts v {
  if (!v) throw Error(m);
}
const para = (s: string) => ({ t: "Para", c: [{ t: "Str", c: s }] });
const image = (s: string) => ({
  t: "Para",
  c: [{
    t: "Image",
    c: [["", [], []], [{ t: "Str", c: "Диаграмма" }], [s, ""]],
  }],
});
const assignment:
  PublicBodyPackage["works"][number]["slots"][number]["assignment"] = {
    requirement: "required",
    workMode: "individual",
  };
type CourseInput = Parameters<typeof exportCourse>[0];
type Work = CourseInput["content"]["assessments"][number];
type FixtureInput = Omit<CourseInput, "config" | "content" | "deferPublish"> & {
  config: ReturnType<typeof import("../_extensions/course-prairielearn/application/declarations.ts").declarations>["raw"];
  content: Required<CourseInput["content"]>;
  deferPublish?: false;
};
function work(id: string, exr = "exr-a"): Work {
  return {
    id,
    source: id + ".qmd",
    kind: "lab",
    title: "Существующая задача",
    slots: [{
      id: exr,
      selection: "fixed",
      candidates: [exr],
      assignment: { ...assignment },
    }],
    extensions: {
      prairielearn: {
        attempts: 1,
        "max-points": 100,
        "auto-points": 0,
        "manual-points": 100,
        pass: { "at-least": 1 },
      },
    },
  };
}
async function fixture(
  run: (
    input: FixtureInput,
    root: string,
    body: (w: Work | undefined) => PublicBodyPackage,
  ) => Promise<void>,
) {
  const root = await Deno.makeTempDir({ prefix: "whole-bank-" });
  try {
    await Deno.mkdir(root + "/project/student", { recursive: true });
    await Deno.writeTextFile(
      root + "/project/student/README.md",
      "PUBLIC_STARTER",
    );
    const first = work("sec-first"), second = work("sec-unit-a");
    const body = (value: Work | undefined): PublicBodyPackage => {
      const w = required(value, "assessment body");
      return ({
      schema: "course-body-package-v2",
      owner: "fixture",
      release: "native",
      apiVersion: [1, 23, 1],
      questions: w.slots.flatMap((s) => s.candidates).map((
        id: string,
      ) => ({
        owner: "fixture",
        id,
        key: "fixture/" + id,
        title: "Существующая задача",
        source: "bank/a.qmd",
        visibility: "public",
        statementVisibility: "open",
        hasPublicSolution: false,
        answerType: "manual",
        condition: [para("PUBLIC_CONDITION")],
        publicAnswer: [],
      })),
      resources: [],
      works: [{
        owner: "fixture",
        id: w.id,
        key: "fixture/" + w.id,
        source: w.source,
        kind: w.kind,
        title: required(w.title),
        introduction: [para("PUBLIC_UNIT_INTRO")],
        slots: w.slots.map((s) => ({
          ...s,
          id: "fixture/" + w.id + "/" + s.id,
          candidates: s.candidates.map((id: string) => "fixture/" + id),
        })),
      }],
    });
    };
    const input: FixtureInput = {
      courseId: "fixture",
      projectRoot: root,
      content: {
        assessments: [first, second],
        exercises: [{
          id: "exr-a",
          target: "prairielearn",
          extensions: { prairielearn: { grading: { method: "manual" } } },
        }],
        projects: [{
          exerciseId: "exr-a",
          bankMember: true,
          projectRoot: "project",
        }],
      },
      checks: {
        schemaVersion: 3,
        courseId: "fixture",
        bookRoot: "tasks",
        projects: [],
      },
      nativeInputs: {},
      studentArtifact: async () => ({
        files: (await publicProjectFiles(root + "/project/student")).map(
          (file) => ({ name: file.name, bytes: file.data }),
        ),
        archive: new Uint8Array([80, 75, 3, 4]),
      }),
      registry: { schemaVersion: 1, profiles: {} },
      config: {
        delivery: {
          book: "tasks",
          course: {
            name: "FIXTURE",
            title: "Проверка",
            timezone: "Europe/Minsk",
            topics: [{
              name: "Fixture",
              color: "blue2",
              description: "Проверка",
            }],
          },
          instances: {
            pilot: {
              title: "Проверка",
              "self-enrollment": false,
              publishing: {
                "start-date": "1970-01-01T00:00:00Z",
                "end-date": "9999-12-31T00:00:00Z",
              },
              works: [first.id, second.id],
            },
          },
        },
        "question-defaults": {
          topic: "Fixture",
          grading: { method: "manual" },
          submission: { mode: "upload" },
          "single-variant": true,
        },
      },
      instance: "pilot",
      output: root + "/out",
      checksOutput: root + "/private.json",
      body: async (id: string) =>
        body(input.content.assessments.find((w) => w.id === id)),
    };
    await run(input, root, body);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
}
async function refuses(input: FixtureInput) {
  let error: unknown;
  try {
    await exportCourse(input);
  } catch (e) {
    error = e;
  }
  assert(error, "Конфликт молча принят");
  assert(
    !await Deno.stat(input.output).then(() => true, () => false),
    "Конфликт опубликовал частичный каталог",
  );
  return String(error);
}
Deno.test("whole-bank: public menu context uses its original resources and excludes raw private body", async () =>
  fixture(async (input, root, body) => {
    const menu = work("sec-reserve");
    required(menu.slots[0]).assignment.requirement = "optional";
    setFixture(menu, ["body"], { blocks: [para("PRIVATE_RAW_MENU")] });
    deleteFixture(menu, ["extensions", "prairielearn"]);
    input.content.assessments.push(menu);
    input.body = async (id: string) => {
      const w = input.content.assessments.find((x) => x.id === id),
        p = body(w);
      if (id === menu.id) {
        required(p.works[0]).introduction = [
          para("PUBLIC_MENU_CONTEXT"),
          image("menu.svg"),
        ];
        p.resources = [{
          owner: "fixture",
          source: menu.source,
          effectiveBase: root,
          target: "menu.svg",
          visibility: "public",
          data: btoa("<svg>MENU</svg>"),
        }];
      }
      return p;
    };
    const result = await exportCourse(input),
      assessment = record(JSON.parse(
        await Deno.readTextFile(
          root +
            "/out/courseInstances/pilot/assessments/sec-unit-a/infoAssessment.json",
        ),
      ));
    assert(
      string(assessment.text).includes("PUBLIC_MENU_CONTEXT") &&
        string(assessment.text).includes("{{ client_files_course }}/menu.svg"),
      "Публичный контекст меню или исходная привязка ресурса потеряны",
    );
    assert(
      !string(assessment.text).includes("PRIVATE_RAW_MENU"),
      "Приватное тело меню попало в обзор",
    );
    assert(
      await Deno.readTextFile(root + "/out/clientFilesCourse/menu.svg") ===
        "<svg>MENU</svg>",
      "Байты ресурса меню изменились",
    );
    assert(
      result.questions.length === 1 && result.works.length === 2,
      "Меню создало лишний вопрос/assessment",
    );
  }));
Deno.test("whole-bank: matching shared question is reused with manual100 and original singleVariant", async () =>
  fixture(async (input, root) => {
    const d = await exportCourse(input);
    assert(d.questions.length === 1, "Один exr продублирован");
    const info = record(JSON.parse(
      await Deno.readTextFile(root + "/out/questions/fixture/exr-a/info.json"),
    ));
    assert(
      info.gradingMethod === "Manual" && info.singleVariant === true &&
        !info.externalGradingOptions,
      "Manual получил grader или потерял singleVariant",
    );
    const a = record(JSON.parse(
      await Deno.readTextFile(
        root +
          "/out/courseInstances/pilot/assessments/sec-unit-a/infoAssessment.json",
      ),
    ));
    assert(
      fixtureAt(a, ["zones", 0, "questions", 0, "autoPoints"]) === 0 &&
        fixtureAt(a, ["zones", 0, "questions", 0, "manualPoints"]) === 100,
      "Ручные100 потеряны",
    );
  }));
for (
  const [name, change] of [
    [
      "condition",
      (p: PublicBodyPackage) => required(p.questions[0]).condition = [para("DIFFERENT_CONDITION")],
    ],
    ["title", (p: PublicBodyPackage) => required(p.questions[0]).title = "Другое название"],
    ["canonical source", (p: PublicBodyPackage) => required(p.questions[0]).source = "foreign/a.qmd"],
  ] as const
) {
  Deno.test(
    "whole-bank: duplicate " + name + " drift refuses atomically",
    async () =>
      fixture(async (input, root, body) => {
        input.body = async (id: string) => {
          const p = body(
            input.content.assessments.find((x) => x.id === id),
          );
          if (id === "sec-unit-a") change(p);
          return p;
        };
        await refuses(input);
      }),
  );
}
Deno.test("whole-bank: duplicate submission semantics refuses rather than preserving first payload", async () =>
  fixture(async (input, root, body) => {
    input.body = async (id: string) => {
      if (id === "sec-unit-a") {
        required(required(input.content.exercises[0]).extensions?.prairielearn).submission = {
          mode: "editor",
        };
      }
      return body(input.content.assessments.find((x) => x.id === id));
    };
    await refuses(input);
  }));
Deno.test("whole-bank: duplicate starter artifact bytes refuse atomically", async () =>
  fixture(async (input) => {
    let count = 0;
    input.studentArtifact = async () => ({
      files: [{
        name: "README.md",
        bytes: new TextEncoder().encode(
          ++count === 1 ? "PUBLIC_A" : "PUBLIC_B",
        ),
      }],
      archive: new Uint8Array([1, 2, count]),
    });
    await refuses(input);
  }));
for (const mappingOnly of [false, true]) {
  Deno.test(
    "whole-bank: duplicate resource " +
      (mappingOnly ? "source mapping" : "bytes") + " drift refuses",
    async () =>
      fixture(async (input, root, body) => {
        input.body = async (id: string) => {
          const p = body(
              input.content.assessments.find((x) => x.id === id),
            ),
            different = id === "sec-unit-a",
            data = different && !mappingOnly ? "<svg>B</svg>" : "<svg>A</svg>";
          required(p.questions[0]).condition = [image("q.svg")];
          p.resources = [{
            owner: "fixture",
            source: different && mappingOnly ? "foreign.qmd" : "bank/a.qmd",
            effectiveBase: root,
            target: "q.svg",
            visibility: "public",
            data: btoa(data),
          }];
          return p;
        };
        await refuses(input);
      }),
  );
}
Deno.test("whole-bank: ambiguous resource target in public projection refuses", async () =>
  fixture(async (input, root, body) => {
    input.body = async (id: string) => {
      const p = body(
        input.content.assessments.find((x) => x.id === id),
      );
      required(p.questions[0]).condition = [image("q.svg")];
      p.resources = await Promise.all(
        ["<svg>A</svg>", "<svg>B</svg>"].map(async (
          data,
        ): Promise<PublicBodyPackage["resources"][number]> => ({
          owner: "fixture",
          source: "bank/a.qmd",
          effectiveBase: root,
          target: "q.svg",
          visibility: "public",
          data: btoa(data),
        })),
      );
      return p;
    };
    await refuses(input);
  }));
Deno.test("whole-bank: foreign sec-unit identity refuses even with valid fixed local slot", async () =>
  fixture(async (input) => {
    required(input.content.assessments[1]).id = "sec-unit-foreign";
    required(input.config.delivery.instances.pilot).works[1] = "sec-unit-foreign";
    await refuses(input);
  }));
Deno.test("whole-bank: missing public menu projection never falls back to raw source body", async () =>
  fixture(async (input, root, body) => {
    const menu = work("sec-reserve");
    required(menu.slots[0]).assignment.requirement = "optional";
    setFixture(menu, ["body"], { blocks: [para("PRIVATE_RAW")] });
    input.content.assessments.push(menu);
    input.body = async (id: string) => {
      const p = body(
        input.content.assessments.find((x) => x.id === id),
      );
      if (id === menu.id) delete required(p.works[0]).introduction;
      return p;
    };
    await refuses(input);
  }));
Deno.test("whole-bank: mixed semantic grading cannot drift to external-only on duplicate", async () =>
  fixture(async (input, root, body) => {
    await prepareMixed(input, root);
    input.body = async (id: string) => {
      if (id === "sec-unit-a") {
        required(required(input.content.exercises[0]).extensions?.prairielearn).grading = "external";
      }
      return body(input.content.assessments.find((x) => x.id === id));
    };
    await refuses(input);
  }));
for (const conflict of [false, true]) {
  Deno.test(
    "whole-bank: two menu contexts " +
      (conflict ? "reject conflicting" : "share identical") + " resource bytes",
    async () =>
      fixture(async (input, root, body) => {
        for (const id of ["sec-menu-one", "sec-menu-two"]) {
          const menu = work(id);
          required(menu.slots[0]).assignment.requirement = "optional";
          deleteFixture(menu, ["extensions", "prairielearn"]);
          input.content.assessments.push(menu);
        }
        input.body = async (id: string) => {
          const p = body(
            input.content.assessments.find((x) => x.id === id),
          );
          if (id.startsWith("sec-menu-")) {
            const data = conflict && id === "sec-menu-two"
              ? "<svg>B</svg>"
              : "<svg>A</svg>";
            required(p.works[0]).introduction = [para(id), image("shared.svg")];
            p.resources = [{
              owner: "fixture",
              source: id + ".qmd",
              effectiveBase: root,
              target: "shared.svg",
              visibility: "public",
              data: btoa(data),
            }];
          }
          return p;
        };
        if (conflict) {
          await refuses(input);
          return;
        }
        await exportCourse(input);
        const a = record(JSON.parse(
          await Deno.readTextFile(
            root +
              "/out/courseInstances/pilot/assessments/sec-unit-a/infoAssessment.json",
          ),
        ));
        assert(
          string(a.text).includes("sec-menu-one") && string(a.text).includes("sec-menu-two"),
          "Один из публичных контекстов потерян",
        );
        assert(
          await Deno.readTextFile(
            root + "/out/clientFilesCourse/shared.svg",
          ) === "<svg>A</svg>",
          "Один общий ресурс изменился",
        );
      }),
  );
}
for (const selection of ["random", "choice"] satisfies Work["slots"][number]["selection"][]) {
  Deno.test(
    "whole-bank: reference-only unit rejects " + selection + " candidate pool",
    async () =>
      fixture(async (input) => {
        const w = required(input.content.assessments[1]);
        w.slots[0] = {
          id: "alt-pool",
          selection,
          candidates: ["exr-a", "exr-b"],
          assignment,
        };
        const error = await refuses(input);
        assert(
          error.includes("reference-only unit"),
          "Отказ не от точного unit guard",
        );
      }),
  );
}
Deno.test("whole-bank: foreign public menu owner refuses before using its introduction", async () =>
  fixture(async (input, root, body) => {
    const menu = work("sec-menu");
    required(menu.slots[0]).assignment.requirement = "optional";
    input.content.assessments.push(menu);
    input.body = async (id: string) => {
      const p = body(
        input.content.assessments.find((x) => x.id === id),
      );
      if (id === menu.id) p.owner = "foreign";
      return p;
    };
    await refuses(input);
  }));

async function prepareMixed(input: FixtureInput, root: string) {
  await Deno.mkdir(root + "/project/student/src/main/java", {
    recursive: true,
  });
  await Deno.mkdir(root + "/project/tests", { recursive: true });
  await Deno.writeTextFile(
    root + "/project/student/src/main/java/A.java",
    "class A {}",
  );
  await Deno.writeTextFile(
    root + "/project/tests/Check.java",
    "class Check {}",
  );
  const check = {
    profile: "fixture",
    runtime: "java25-junit-v1",
    sourceProfile: {
      root: "student/src/main/java",
      mode: "implementation",
      include: ["**/*.java"],
    },
    java: {
      release: 25,
      encoding: "UTF-8",
      "compiler-options": ["-proc:none"],
    },
    limits: {
      "outer-seconds": 30,
      networking: false,
      "max-output-bytes": 65536,
    },
    scoring: { mode: "all-pass" },
    discovery: { "min-executed": 1, "allow-skipped": false },
  };
  const parsed = NativeProjectCheckSchema.parse({
    ...check,
    "source-profile": "main",
    tests: ["tests/*.java"],
  });
  const source = {
    name: "A.java",
    bytes: new TextEncoder().encode("class A {}"),
  };
  const test = {
    name: "Check.java",
    bytes: new TextEncoder().encode("class Check {}"),
  };
  input.checks.projects = [{
    exerciseId: "exr-a",
    qualifiedId: "fixture/exr-a",
    source: "bank/a.qmd",
    bankMember: true,
    projectRoot: "project",
    check: parsed,
    sources: [
      selectedCheckFile({
        target: "student/src/main/java/A.java",
        bytes: source.bytes,
      }, source.name),
    ],
    trustedTests: [
      selectedCheckFile(
        { target: "tests/Check.java", bytes: test.bytes },
        test.name,
      ),
    ],
    verificationTests: [],
    references: [],
    contractFixtures: [],
    readiness: { ready: true, missing: [] },
  }];
  input.nativeInputs = {
    "exr-a": {
      sources: [source],
      tests: [test],
      descriptor: runtimeDescriptor(
        parsed,
        { javaRelease: 25 },
        [source.name],
        [test.name],
      ),
    },
  };
  input.registry.profiles = {
    "java25-junit-v1": {
      mode: "implementation",
      javaRelease: 25,
      image: "registry/fixture@sha256:" + "c".repeat(64),
    },
  };
  required(required(input.content.exercises[0]).extensions?.prairielearn).grading = {
    method: "mixed",
  };
  for (const w of input.content.assessments) {
    w.extensions.prairielearn["auto-points"] = 70;
    w.extensions.prairielearn["manual-points"] = 30;
  }
}

Deno.test("whole-bank: matching mixed duplicate retains complete starter and teacher30", async () =>
  fixture(async (input, root) => {
    await prepareMixed(input, root);
    const d = await exportCourse(input);
    assert(d.questions.length === 1, "Повтор mixed создал новый вопрос");
    const base = root + "/out/questions/fixture/exr-a";
    assert(
      await Deno.readTextFile(base + "/serverFilesQuestion/starter/A.java") ===
        "class A {}",
      "Закрытый starter snapshot потерян",
    );
    const info = record(JSON.parse(await Deno.readTextFile(base + "/info.json")));
    assert(
      info.gradingMethod === "External" &&
        required(d.gradingPayloads["fixture/exr-a"]).grading.method === "mixed",
      "Mixed ошибочно стал external-only",
    );
    const a = record(JSON.parse(
      await Deno.readTextFile(
        root +
          "/out/courseInstances/pilot/assessments/sec-unit-a/infoAssessment.json",
      ),
    ));
    assert(
      fixtureAt(a, ["zones", 0, "questions", 0, "autoPoints"]) === 70 &&
        fixtureAt(a, ["zones", 0, "questions", 0, "manualPoints"]) === 30,
      "Повторный mixed потерял teacher30",
    );
  }));
Deno.test("whole-bank: internally valid public Body cannot substitute another unit member", async () =>
  fixture(async (input, root, body) => {
    input.content.exercises.push({
      id: "exr-b",
      target: "prairielearn",
      extensions: { prairielearn: { grading: { method: "manual" } } },
    });
    input.content.projects.push({
      exerciseId: "exr-b",
      bankMember: true,
      projectRoot: "project",
    });
    input.body = async (id: string) => {
      const p = body(
        input.content.assessments.find((w) => w.id === id),
      );
      if (id === "sec-unit-a") {
        required(p.questions[0]).id = "exr-b";
        required(p.questions[0]).key = "fixture/exr-b";
        required(required(p.works[0]).slots[0]).id = "fixture/sec-unit-a/exr-b";
        required(required(p.works[0]).slots[0]).candidates = ["fixture/exr-b"];
      }
      return p;
    };
    await refuses(input);
  }));

for (const test of [
  { name: "editor", names: ["src/main/java/Решение.java"] },
  { name: "tree ZIP", names: ["programs/one/src/main/java/Study.java", "programs/two/src/main/java/Value.java", "programs/three/src/main/java/Key.java"] },
]) {
  Deno.test("Manual Java " + test.name + " использует только реальные starter targets без автопроверки", async () =>
    fixture(async (input, root) => {
      const source = "// Настоящий UTF-8 starter: ёж & <x> {{x}}\n";
      input.studentArtifact = async () => ({
        files: [
          ...test.names.map(name => ({ name, bytes: new TextEncoder().encode(source + name), reason: "starter" })),
          { name: "src/main/java/Foreign.java", bytes: new TextEncoder().encode("PUBLIC_CHECK"), reason: "testset:public" },
          { name: "src/test/java/PublicChecks.java", bytes: new TextEncoder().encode("PUBLIC_CHECK"), reason: "starter" },
          { name: "examples/compile/Bad.java", bytes: new TextEncoder().encode("COMPILE_EXAMPLE"), reason: "starter" },
        ], archive: new Uint8Array([80, 75, 3, 4]),
      });
      await exportCourse(input);
      const base = root + "/out/questions/fixture/exr-a";
      const info = record(JSON.parse(await Deno.readTextFile(base + "/info.json")));
      const html = await Deno.readTextFile(base + "/question.html");
      assert(info.gradingMethod === "Manual" && !info.externalGradingOptions && !html.includes("pl-external-grader-results"), "Manual получил автоматический runtime");
      assert(!html.includes("optional-file-") && !html.includes('allow-blank="true"'), "Manual формы смешаны");
      if (test.name === "editor") {
        assert((html.match(/<pl-file-editor /g) ?? []).length === 1 && !html.includes("<pl-file-upload"), "Manual1 требует один редактор");
        assert(html.includes('file-name="src/main/java/Решение.java"') && html.includes("ёж &amp; &lt;x&gt; &#123;&#123;x&#125;&#125;"), "Manual имя/UTF-8 потеряны");
        assert(await Deno.readTextFile(base + "/serverFilesQuestion/starter/" + test.names[0]) === source + test.names[0], "Manual mirror отличается от Core starter bytes");
      } else {
        assert(!html.includes("<pl-file-editor") && (html.match(/<pl-file-upload /g) ?? []).length === 1 && html.includes('file-names="solution.zip"'), "Manual3tree требует только ZIP");
      }
      assert(!html.includes('<pl-file-editor file-name="src/main/java/Foreign.java"'), "Публичный testset стал исходником ответа");
      let foreignMirror = false;
      try { await Deno.stat(base + "/serverFilesQuestion/starter/src/main/java/Foreign.java"); foreignMirror = true; } catch (error) { if (!(error instanceof Deno.errors.NotFound)) throw error; }
      assert(!foreignMirror, "Публичный testset стал canonical starter");
    }));
}
Deno.test("Manual Java editor отказывает при нетекстовом starter до публикации", async () =>
  fixture(async input => {
    input.studentArtifact = async () => ({ files: [{ name: "src/main/java/Решение.java", bytes: new Uint8Array([255]), reason: "starter" }], archive: new Uint8Array([80, 75, 3, 4]) });
    await refuses(input);
  }));
