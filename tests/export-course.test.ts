import type { PublicBodyPackage } from "course-core/body-export/model.ts";
import { NativeProjectCheckSchema } from "../_extensions/course-prairielearn/application/native-checks.ts";
import { runtimeDescriptor } from "../_extensions/course-prairielearn/application/runtime-descriptor.ts";
import {
  declarations,
  question,
} from "../_extensions/course-prairielearn/application/declarations.ts";
import { infoQuestion } from "../_extensions/course-prairielearn/application/native-validators.js";
import { validateAssessmentSemantics } from "../_extensions/course-prairielearn/application/native-semantics.ts";
const assert = (v: unknown, m: string) => {
  if (!v) throw new Error(m);
};
Deno.test("pinned native Exam semantics reject question ceilings including alternative pools; Homework keeps ceilings", () => {
  for (
    const invalid of [
      { type: "Homework", multipleInstance: true, zones: [] },
      { type: "Homework", zones: [{ questions: [{ points: [3, 1] }] }] },
      {
        type: "Homework",
        zones: [{ questions: [{ points: 0, maxPoints: 2 }] }],
      },
      { type: "Exam", zones: [{ questions: [{ points: [1, 3] }] }] },
    ]
  ) {
    let rejected = false;
    try {
      validateAssessmentSemantics(invalid, "bad/infoAssessment.json");
    } catch (e) {
      rejected = String(e).includes("PL upstream semantic");
    }
    assert(rejected, "schema-valid native semantic conflict accepted");
  }
  for (const field of ["maxPoints", "maxAutoPoints"]) {
    for (const pooled of [false, true]) {
      const member = { id: "demo/exr-a", points: 1, [field]: 1 };
      const assessment = {
        type: "Exam",
        zones: [{
          questions: [
            pooled ? { numberChoose: 1, alternatives: [member] } : member,
          ],
        }],
      };
      let rejected = false;
      try {
        validateAssessmentSemantics(assessment, "exam/infoAssessment.json");
      } catch (e) {
        rejected = String(e).includes("Exam question") &&
          String(e).includes("exam/infoAssessment.json");
      }
      assert(rejected, "schema-valid Exam question ceiling accepted: " + field);
      validateAssessmentSemantics(
        { ...assessment, type: "Homework" },
        "homework/infoAssessment.json",
      );
    }
  }
  validateAssessmentSemantics({
    type: "Exam",
    maxPoints: 3,
    zones: [{
      questions: [{ id: "demo/exr-a", points: 1, triesPerVariant: 3 }],
    }],
  }, "valid/infoAssessment.json");
});
Deno.test("closed delivery defaults and selected instance", () => {
  const d = declarations({
    delivery: {
      book: "tasks",
      course: {
        name: "JAVA",
        title: "Java",
        timezone: "Europe/Minsk",
        topics: [{ name: "Java", color: "blue2", description: "Java" }],
      },
      instances: {
        pilot: {
          title: "Pilot",
          "self-enrollment": false,
          publishing: {
            "start-date": "1970-01-01T00:00:00Z",
            "end-date": "9999-12-31T00:00:00Z",
          },
          works: ["sec-lab"],
        },
      },
    },
    "question-defaults": {
      topic: "Java",
      submission: { mode: "editor", "ace-mode": "ace/mode/java" },
      "single-variant": false,
    },
  }, "pilot");
  for (
    const publishing of [undefined, {}, {
      "start-date": "2026-01-01",
      "end-date": "2027-01-01",
    }, {
      "start-date": "2027-01-01T00:00:00Z",
      "end-date": "2026-01-01T00:00:00Z",
    }, {
      "start-date": "2026-01-01T00:00:00Z",
      "end-date": "2027-01-01T00:00:00Z",
      unknown: true,
    }]
  ) {
    const raw = structuredClone(d.raw);
    raw.delivery.instances.pilot.publishing = publishing;
    let rejected = false;
    try {
      declarations(raw, "pilot");
    } catch {
      rejected = true;
    }
    assert(rejected, "invalid instance publishing accepted");
  }
  assert(d.instance.works[0] === "sec-lab", "work lost");
  const semester = structuredClone(d.raw);
  semester.delivery.instances["2026-2027-s1"] = structuredClone(
    semester.delivery.instances.pilot,
  );
  const next = declarations(semester, "2026-2027-s1");
  assert(
    next.instance.works[0] === "sec-lab",
    "Семестр с годом в начале должен сохранять назначенные работы",
  );
  assert(
    declarations(semester, "pilot").instance.works[0] === "sec-lab",
    "Добавление семестра не должно менять старый pilot",
  );
  for (
    const key of [
      "../2026",
      "/2026",
      "2026/2027",
      "-2026",
      "2026 S1",
      "2026_S1",
    ]
  ) {
    const unsafe = structuredClone(d.raw);
    unsafe.delivery.instances[key] = structuredClone(
      unsafe.delivery.instances.pilot,
    );
    let rejected = false;
    try {
      declarations(unsafe, key);
    } catch {
      rejected = true;
    }
    assert(rejected, "Недопустимый ключ семестра принят: " + key);
  }
  for (const field of ["unknown", "runtime", "sources"]) {
    let rejected = false;
    try {
      declarations({ ...d.raw, [field]: true }, "pilot");
    } catch {
      rejected = true;
    }
    assert(rejected, "unknown accepted");
  }
});
import {
  exportCourse,
  identity,
} from "../_extensions/course-prairielearn/application/export-course.ts";
import {
  nativeChecksManifest,
  selectedCheckFile,
} from "../_extensions/course-prairielearn/application/native-check-inventory.ts";
import { readFile } from "node:fs/promises";
Deno.test("functional export v5 передаёт выбранные байты, точные имена и только публичные файлы", async () => {
  const root = await Deno.makeTempDir(
    Deno.env.get("PL_EXDEV_TEST_DIR")
      ? { dir: Deno.env.get("PL_EXDEV_TEST_DIR") }
      : {},
  );
  await Deno.mkdir(root + "/project");
  try {
    const config = {
      delivery: {
        book: "tasks",
        course: {
          name: "JAVA",
          title: "Java",
          timezone: "Europe/Minsk",
          topics: [{ name: "Java", color: "blue2", description: "Java" }],
        },
        instances: {
          pilot: {
            title: "Pilot",
            "self-enrollment": false,
            publishing: {
              "start-date": "1970-01-01T00:00:00Z",
              "end-date": "9999-12-31T00:00:00Z",
            },
            works: ["sec-lab"],
          },
        },
      },
      "question-defaults": {
        topic: "Java",
        submission: { mode: "editor", "ace-mode": "ace/mode/java" },
        "single-variant": false,
      },
    };
    const assignment:
      PublicBodyPackage["works"][number]["slots"][number]["assignment"] = {
        requirement: "required",
        workMode: "individual",
      };
    const work = {
      id: "sec-lab",
      source: "lab.qmd",
      kind: "lab",
      title: "Lab",
      slots: [{
        id: "exr-a",
        selection: "fixed",
        candidates: ["exr-a"],
        assignment,
      }],
      extensions: {
        prairielearn: {
          attempts: 2,
          "question-points": 2.5,
          "question-max-points": 6,
          "max-points": 12,
          pass: { "at-least": 1 },
          assignment: { "student-label": "test" },
        },
      },
    };
    const body: PublicBodyPackage = {
      schema: "course-body-package-v2",
      owner: "demo",
      release: "1",
      apiVersion: [1, 23, 1],
      questions: [{
        owner: "demo",
        id: "exr-a",
        key: "demo/exr-a",
        title: "Задача A",
        source: "a.qmd",
        visibility: "public",
        statementVisibility: "open",
        hasPublicSolution: false,
        answerType: "manual",
        condition: [{ t: "Para", c: [{ t: "Str", c: "PUBLIC_CONDITION" }] }],
        publicAnswer: [],
      }],
      resources: [{
        owner: "demo",
        source: "lab.qmd",
        effectiveBase: root,
        target: "diagram.svg",
        visibility: "public",
        data: btoa("<svg>PUBLIC_DIAGRAM</svg>"),
      }],
      works: [{
        owner: "demo",
        id: "sec-lab",
        key: "demo/sec-lab",
        source: "lab.qmd",
        kind: "lab",
        title: "Lab",
        introduction: [{
          t: "Para",
          c: [
            {
              t: "Str",
              c: 'Подготовка к работе {{literal}} PL_CLIENT_FILE_URL_TOKEN src="PL_CLIENT_FILE_URL_TOKEN/example.png" href="PL_CLIENT_FILE_URL_TOKEN/example.png" PL_CLIENT_FILE_URL_TOKEN_0',
            },
            { t: "Space" },
            {
              t: "Link",
              c: [["", [], []], [{ t: "Str", c: "Теория" }], [
                "https://example.test/theory.html",
                "",
              ]],
            },
            {
              t: "Image",
              c: [["", [], []], [{ t: "Str", c: "Диаграмма" }], [
                "diagram.svg",
                "",
              ]],
            },
          ],
        }],
        slots: [{
          id: "demo/sec-lab/exr-a",
          selection: "fixed",
          candidates: ["demo/exr-a"],
          assignment,
        }],
      }],
    };

    const check = NativeProjectCheckSchema.parse({
      profile: "java",
      "source-profile": "main",
      runtime: "java25-junit-v1",
      sourceProfile: {
        root: "student/src/main/java",
        mode: "implementation",
        include: ["**/*.java"],
      },
      tests: ["tests/*.java"],
      scoring: { mode: "weighted" },
    });
    const source = {
      name: "pkg/A.java",
      bytes: new TextEncoder().encode("package pkg; class A {}"),
    };
    const test = {
      name: "ATest.java",
      bytes: new TextEncoder().encode("class ATest {} // PRIVATE_TEST"),
    };
    const project = {
      exerciseId: "exr-a",
      source: "a.qmd",
      qualifiedId: "demo/exr-a",
      bankMember: true,
      projectRoot: "project",
      check,
      sources: [
        selectedCheckFile({
          target: "student/src/main/java/pkg/A.java",
          bytes: source.bytes,
        }, source.name),
      ],
      trustedTests: [
        selectedCheckFile({ target: test.name, bytes: test.bytes }, test.name),
      ],
      verificationTests: [],
      references: [],
      contractFixtures: [],
      readiness: { ready: true, missing: [] },
    };
    const input: Parameters<typeof exportCourse>[0] = {
      courseId: "demo",
      projectRoot: root,
      content: {
        assessments: [work],
        exercises: [{ id: "exr-a", target: "prairielearn" }],
        projects: [project],
      },
      checks: nativeChecksManifest({
        courseId: "demo",
        bookRoot: "tasks",
        projects: [project],
      }),
      config,
      registry: {
        schemaVersion: 1,
        profiles: {
          "java25-junit-v1": {
            mode: "implementation",
            javaRelease: 25,
            image: "registry/image@sha256:" + "c".repeat(64),
          },
        },
      },
      instance: "pilot",
      output: root + "/out",
      checksOutput: root + "/checks.json",
      body: async () => body,
      nativeInputs: {
        "exr-a": {
          sources: [source],
          tests: [test],
          descriptor: runtimeDescriptor(check, { javaRelease: 25 }, [
            source.name,
          ], [test.name]),
        },
      },
      studentArtifact: async () => ({
        files: [{
          name: "README.md",
          bytes: new TextEncoder().encode("PUBLIC_README"),
        }, source],
        archive: new Uint8Array([80, 75, 3, 4]),
      }),
    };
    const result = await exportCourse(input);
    assert(result.schemaVersion === 5, "Delivery schema changed");
    assert(
      result.files.every((file: unknown) => typeof file === "string"),
      "Functional file list must contain names",
    );
    const questionDir = input.output + "/questions/demo/exr-a";
    const html = await Deno.readTextFile(questionDir + "/question.html");
    assert(
      html.includes("pkg/A.java") && !html.includes("PRIVATE_TEST"),
      "Student editor filename/privacy lost",
    );
    const starter = await Deno.readTextFile(
      questionDir + "/clientFilesQuestion/starter/pkg/A.java",
    );
    assert(
      starter === "package pkg; class A {}",
      "Actual selected source bytes lost",
    );
    assert(
      await Deno.readTextFile(questionDir + "/tests/ATest.java").catch(() =>
        ""
      ) !== "",
      "Trusted tests missing",
    );
    const second = await exportCourse({
      ...input,
      output: root + "/second",
      checksOutput: root + "/second-checks.json",
    });
    assert(
      JSON.stringify(result.files) === JSON.stringify(second.files),
      "File list order unstable",
    );
    for (const key of ["infoCourse.json", "questions/demo/exr-a/info.json"]) {
      assert(
        (await readFile(input.output + "/" + key)).equals(
          await readFile(root + "/second/" + key),
        ),
        "Stable export changed " + key,
      );
    }
    for (
      const [name, mutate] of [["missing-bytes", (value: typeof input) => {
        value.nativeInputs = {};
      }], ["missing-tests", (value: typeof input) => {
        value.nativeInputs = {
          "exr-a": {
            ...input.nativeInputs["exr-a"],
            tests: [],
          },
        };
      }]] as const
    ) {
      const value = {
        ...input,
        output: root + "/bad-" + name,
        checksOutput: root + "/bad-" + name + ".json",
      };
      mutate(value);
      let refused = false;
      try {
        await exportCourse(value);
      } catch {
        refused = true;
      }
      assert(refused, "Invalid native input accepted " + name);
      assert(
        !await Deno.stat(value.output).then(() => true, () => false),
        "Failure published partial output",
      );
    }
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
Deno.test("course instance assessment UUIDs use approved stable namespaces", async () => {
  const course = await identity("course/demo");
  assert(
    course === "bc5b90d9-1bd7-5ea9-9872-b6ef0aa7d68c",
    "course UUID drift",
  );
  assert(
    await identity("instance/pilot", course) ===
      "8bdbfb6e-1345-5297-80dc-4cff1f667a3d",
    "instance UUID drift",
  );
  assert(
    await identity("assessment/sec-lab", course) ===
      "6cbeb308-b0c5-51fc-bc0e-0f6bcbe75a45",
    "assessment UUID drift",
  );
  const java = await identity("course/java-semester-one");
  assert(
    java === "036dee22-0705-5c6d-abd5-30620afcce9b",
    "Java course UUID изменился",
  );
  assert(
    await identity("instance/pilot", java) ===
      "18980649-6462-5ba4-a0c4-b5bcd1634fef",
    "Java pilot UUID изменился",
  );
  assert(
    await identity("instance/2026-2027-s1", java) ===
      "4141f9c0-8233-591f-ac1c-53275f3b8c02",
    "UUID нового семестра вычислен вне утверждённого namespace",
  );
});
Deno.test("question repeat declaration is closed and typed", () => {
  for (const value of [undefined, true, false]) {
    const settings = question({
      topic: "Java",
      submission: { mode: "upload" },
      ...(value === undefined ? {} : { "single-variant": value }),
    });
    assert(
      value === undefined
        ? !Object.hasOwn(settings, "singleVariant")
        : settings.singleVariant === value,
      "question normalization lost repeat value",
    );
  }
  for (const value of ["false", 0, null, [], {}]) {
    let rejected = false;
    try {
      question({
        topic: "Java",
        submission: { mode: "upload" },
        "single-variant": value,
      });
    } catch {
      rejected = true;
    }
    assert(rejected, "invalid repeat scalar accepted");
  }
});

Deno.test("additional Java policy rejects present null/false and closed-field defects", () => {
  const policy = {
    archive: "additional-sources.zip",
    "max-files": 128,
    "max-file-bytes": 1048576,
    "max-total-bytes": 4194304,
    "max-archive-bytes": 2097152,
  };
  for (
    const value of [null, false, 0, { ...policy, commands: [] }, {
      ...policy,
      "max-files": 129,
    }, { ...policy, "max-files": true }]
  ) {
    const raw: unknown = {
      profile: "fixture",
      "source-profile": "main",
      tests: ["tests/*.java"],
      scoring: { mode: "weighted" },
      runtime: "java25-junit-v1",
      sourceProfile: {
        mode: "implementation",
        root: "student",
        include: ["**/*.java"],
      },
      "additional-java-sources": value,
    };
    // Намеренно неверный raw приходит через внешнюю JS-границу; результат не используется.
    let denied = false;
    try {
      Reflect.apply(runtimeDescriptor, undefined, [raw, { javaRelease: 25 }, [
        "Main.java",
      ], ["ExampleTest.java"]]);
    } catch {
      denied = true;
    }
    assert(
      denied,
      "invalid present Java policy silently disabled: " + JSON.stringify(value),
    );
  }
});
