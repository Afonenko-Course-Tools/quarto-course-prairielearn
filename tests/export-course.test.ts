import {
  required,
  record,
  string,
  array,
  fixtureAt,
} from "./fixture-values.ts";
import type { ExportCourseContent } from "../_extensions/course-prairielearn/application/export-course.ts";
type CourseFixtureInput = Omit<
  Parameters<typeof exportCourse>[0],
  "deferPublish"
> & {
  deferPublish?: false;
  config: ReturnType<typeof declarations>["raw"];
};
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
Deno.test(
  "pinned native Exam semantics reject question ceilings including alternative pools; Homework keeps ceilings",
  () => {
    for (const invalid of [
      { type: "Homework", multipleInstance: true, zones: [] },
      { type: "Homework", zones: [{ questions: [{ points: [3, 1] }] }] },
      {
        type: "Homework",
        zones: [{ questions: [{ points: 0, maxPoints: 2 }] }],
      },
      { type: "Exam", zones: [{ questions: [{ points: [1, 3] }] }] },
    ]) {
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
          zones: [
            {
              questions: [
                pooled ? { numberChoose: 1, alternatives: [member] } : member,
              ],
            },
          ],
        };
        let rejected = false;
        try {
          validateAssessmentSemantics(assessment, "exam/infoAssessment.json");
        } catch (e) {
          rejected =
            String(e).includes("Exam question") &&
            String(e).includes("exam/infoAssessment.json");
        }
        assert(
          rejected,
          "schema-valid Exam question ceiling accepted: " + field,
        );
        validateAssessmentSemantics(
          { ...assessment, type: "Homework" },
          "homework/infoAssessment.json",
        );
      }
    }
    validateAssessmentSemantics(
      {
        type: "Exam",
        maxPoints: 3,
        zones: [
          {
            questions: [{ id: "demo/exr-a", points: 1, triesPerVariant: 3 }],
          },
        ],
      },
      "valid/infoAssessment.json",
    );
  },
);
Deno.test("closed delivery defaults and selected instance", () => {
  const d = declarations(
    {
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
    },
    "pilot",
  );
  for (const publishing of [
    undefined,
    {},
    {
      "start-date": "2026-01-01",
      "end-date": "2027-01-01",
    },
    {
      "start-date": "2027-01-01T00:00:00Z",
      "end-date": "2026-01-01T00:00:00Z",
    },
    {
      "start-date": "2026-01-01T00:00:00Z",
      "end-date": "2027-01-01T00:00:00Z",
      unknown: true,
    },
  ]) {
    const raw: {
      delivery: { instances: Record<string, { publishing: unknown }> };
    } = structuredClone(d.raw);
    required(raw.delivery.instances.pilot).publishing = publishing;
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
    required(semester.delivery.instances.pilot),
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
  for (const key of [
    "../2026",
    "/2026",
    "2026/2027",
    "-2026",
    "2026 S1",
    "2026_S1",
  ]) {
    const unsafe = structuredClone(d.raw);
    unsafe.delivery.instances[key] = structuredClone(
      required(unsafe.delivery.instances.pilot),
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
Deno.test(
  "functional export v5 передаёт выбранные байты, точные имена и только публичные файлы",
  async () => {
    const root = await Deno.makeTempDir(
      Deno.env.get("PL_EXDEV_TEST_DIR")
        ? { dir: required(Deno.env.get("PL_EXDEV_TEST_DIR")) }
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
      const assignment: PublicBodyPackage["works"][number]["slots"][number]["assignment"] =
        {
          requirement: "required",
          workMode: "individual",
        };
      const work: ExportCourseContent["assessments"][number] = {
        id: "sec-lab",
        source: "lab.qmd",
        kind: "lab",
        title: "Lab",
        slots: [
          {
            id: "exr-a",
            selection: "fixed",
            candidates: ["exr-a"],
            assignment,
          },
        ],
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
        questions: [
          {
            owner: "demo",
            id: "exr-a",
            key: "demo/exr-a",
            title: "Задача A",
            source: "a.qmd",
            visibility: "public",
            statementVisibility: "open",
            hasPublicSolution: false,
            answerType: "manual",
            condition: [
              { t: "Para", c: [{ t: "Str", c: "PUBLIC_CONDITION" }] },
            ],
            publicAnswer: [],
          },
        ],
        resources: [
          {
            owner: "demo",
            source: "lab.qmd",
            effectiveBase: root,
            target: "diagram.svg",
            visibility: "public",
            data: btoa("<svg>PUBLIC_DIAGRAM</svg>"),
          },
        ],
        works: [
          {
            owner: "demo",
            id: "sec-lab",
            key: "demo/sec-lab",
            source: "lab.qmd",
            kind: "lab",
            title: "Lab",
            introduction: [
              {
                t: "Para",
                c: [
                  {
                    t: "Str",
                    c: 'Подготовка к работе {{literal}} PL_CLIENT_FILE_URL_TOKEN src="PL_CLIENT_FILE_URL_TOKEN/example.png" href="PL_CLIENT_FILE_URL_TOKEN/example.png" PL_CLIENT_FILE_URL_TOKEN_0',
                  },
                  { t: "Space" },
                  {
                    t: "Link",
                    c: [
                      ["", [], []],
                      [{ t: "Str", c: "Теория" }],
                      ["https://example.test/theory.html", ""],
                    ],
                  },
                  {
                    t: "Image",
                    c: [
                      ["", [], []],
                      [{ t: "Str", c: "Диаграмма" }],
                      ["diagram.svg", ""],
                    ],
                  },
                ],
              },
            ],
            slots: [
              {
                id: "demo/sec-lab/exr-a",
                selection: "fixed",
                candidates: ["demo/exr-a"],
                assignment,
              },
            ],
          },
        ],
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
          selectedCheckFile(
            {
              target: "student/src/main/java/pkg/A.java",
              bytes: source.bytes,
            },
            source.name,
          ),
        ],
        trustedTests: [
          selectedCheckFile(
            { target: test.name, bytes: test.bytes },
            test.name,
          ),
        ],
        verificationTests: [],
        references: [],
        contractFixtures: [],
        readiness: { ready: true, missing: [] },
      };
      const input: CourseFixtureInput = {
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
            descriptor: runtimeDescriptor(
              check,
              { javaRelease: 25 },
              [source.name],
              [test.name],
            ),
          },
        },
        studentArtifact: async () => ({
          files: [
            {
              name: "README.md",
              bytes: new TextEncoder().encode("PUBLIC_README"),
            },
            source,
          ],
          archive: new Uint8Array([80, 75, 3, 4]),
        }),
      };
      const result = await exportCourse(input);
      assert(result.schemaVersion === 5, "Delivery schema changed");
      assert(
        result.files.every((file: unknown) => typeof file === "string"),
        "Functional file list must contain names",
      );
      const assessment = record(
        JSON.parse(
          await Deno.readTextFile(
            input.output +
              "/courseInstances/pilot/assessments/sec-lab/infoAssessment.json",
          ),
        ),
      );
      assert(
        string(assessment.text).includes("Подготовка к работе"),
        "Публичное введение потеряно",
      );
      assert(
        !string(assessment.text).includes("Выполните не менее") &&
          !string(assessment.text).includes("Частичный результат"),
        "Exporter повторяет правило выполнения во введении",
      );
      assert(
        fixtureAt(assessment, [
          "zones",
          0,
          "questions",
          0,
          "preferences",
          "courseRequirement",
        ]) === "required" &&
          fixtureAt(assessment, ["zones", 0, "questions", 0, "points"]) ===
            2.5 &&
          fixtureAt(assessment, ["zones", 0, "questions", 0, "maxPoints"]) ===
            6 &&
          assessment.maxPoints === 12,
        "Native requirement или веса изменены",
      );
      const deliveredWork = required(result.works[0]);
      assert(
        deliveredWork.completion.atLeast === 1 &&
          deliveredWork.completion.requiredSlotIds[0] ===
            "demo/sec-lab/exr-a" &&
          record(deliveredWork.policy.pass)["at-least"] === 1,
        "Метаданные pass изменены",
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
        (await Deno.readTextFile(questionDir + "/tests/ATest.java").catch(
          () => "",
        )) !== "",
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
      for (const [name, mutate] of [
        [
          "missing-bytes",
          (value: typeof input) => {
            value.nativeInputs = {};
          },
        ],
        [
          "missing-tests",
          (value: typeof input) => {
            value.nativeInputs = {
              "exr-a": {
                ...required(input.nativeInputs["exr-a"]),
                tests: [],
              },
            };
          },
        ],
      ] as const) {
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
          !(await Deno.stat(value.output).then(
            () => true,
            () => false,
          )),
          "Failure published partial output",
        );
      }
    } finally {
      await Deno.remove(root, { recursive: true });
    }
  },
);
Deno.test(
  "course instance assessment UUIDs use approved stable namespaces",
  async () => {
    const course = await identity("course/demo");
    assert(
      course === "bc5b90d9-1bd7-5ea9-9872-b6ef0aa7d68c",
      "course UUID drift",
    );
    assert(
      (await identity("instance/pilot", course)) ===
        "8bdbfb6e-1345-5297-80dc-4cff1f667a3d",
      "instance UUID drift",
    );
    assert(
      (await identity("assessment/sec-lab", course)) ===
        "6cbeb308-b0c5-51fc-bc0e-0f6bcbe75a45",
      "assessment UUID drift",
    );
    const java = await identity("course/java-semester-one");
    assert(
      java === "036dee22-0705-5c6d-abd5-30620afcce9b",
      "Java course UUID изменился",
    );
    assert(
      (await identity("instance/pilot", java)) ===
        "18980649-6462-5ba4-a0c4-b5bcd1634fef",
      "Java pilot UUID изменился",
    );
    assert(
      (await identity("instance/2026-2027-s1", java)) ===
        "4141f9c0-8233-591f-ac1c-53275f3b8c02",
      "UUID нового семестра вычислен вне утверждённого namespace",
    );
  },
);
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

Deno.test(
  "additional Java policy rejects present null/false and closed-field defects",
  () => {
    const policy = {
      archive: "additional-sources.zip",
      "max-files": 128,
      "max-file-bytes": 1048576,
      "max-total-bytes": 4194304,
      "max-archive-bytes": 2097152,
    };
    for (const value of [
      null,
      false,
      0,
      { ...policy, commands: [] },
      {
        ...policy,
        "max-files": 129,
      },
      { ...policy, "max-files": true },
    ]) {
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
        Reflect.apply(runtimeDescriptor, undefined, [
          raw,
          { javaRelease: 25 },
          ["Main.java"],
          ["ExampleTest.java"],
        ]);
      } catch {
        denied = true;
      }
      assert(
        denied,
        "invalid present Java policy silently disabled: " +
          JSON.stringify(value),
      );
    }
  },
);

/** Небольшая настоящая поставка: без Core operation и запуска runtime. */
async function inventoryCourseFixture(
  run: (
    input: CourseFixtureInput,
    root: string,
    metrics: { pandocCalls(): number },
  ) => Promise<void>,
) {
  const root = await Deno.makeTempDir({ prefix: "pl-inventory-test-" });
  try {
    await Deno.mkdir(root + "/project");
    const assignment = {
      requirement: "required",
      workMode: "individual",
    } as const;
    const works = ["sec-first", "sec-second"].map(
      (id): ExportCourseContent["assessments"][number] => ({
        id,
        source: id + ".qmd",
        kind: "lab",
        title: "Проверка",
        slots: [
          {
            id: "exr-a",
            selection: "fixed",
            candidates: ["exr-a"],
            assignment,
          },
        ],
        extensions: {
          prairielearn: {
            attempts: 1,
            "question-points": 1,
            pass: { "at-least": 1 },
          },
        },
      }),
    );
    const bytes = new TextEncoder().encode("package pkg; class A {}");
    const check = NativeProjectCheckSchema.parse({
      profile: "java",
      "source-profile": "main",
      runtime: "java25-junit-v1",
      sourceProfile: {
        root: "student",
        mode: "implementation",
        include: ["**/*.java"],
      },
      tests: ["tests/*.java"],
      scoring: { mode: "weighted" },
    });
    const project = {
      exerciseId: "exr-a",
      source: "a.qmd",
      qualifiedId: "demo/exr-a",
      bankMember: true,
      projectRoot: "project",
      check,
      sources: [
        selectedCheckFile(
          { target: "student/pkg/A.java", bytes },
          "pkg/A.java",
        ),
      ],
      trustedTests: [],
      verificationTests: [],
      references: [],
      contractFixtures: [],
      readiness: { ready: true, missing: [] },
    };
    const input: CourseFixtureInput = {
      courseId: "demo",
      projectRoot: root,
      content: {
        assessments: works,
        exercises: [{ id: "exr-a", target: "prairielearn" }],
        projects: [project],
      },
      checks: nativeChecksManifest({
        courseId: "demo",
        bookRoot: "tasks",
        projects: [project],
      }),
      config: {
        delivery: {
          book: "tasks",
          course: {
            name: "DEMO",
            title: "Проверка",
            timezone: "Europe/Minsk",
            topics: [{ name: "Java", color: "blue2", description: "Java" }],
          },
          instances: {
            pilot: {
              title: "Проверка",
              "self-enrollment": false,
              publishing: {
                "start-date": "1970-01-01T00:00:00Z",
                "end-date": "9999-12-31T00:00:00Z",
              },
              works: works.map((w) => w.id),
            },
          },
        },
        "question-defaults": {
          topic: "Java",
          submission: { mode: "editor", "ace-mode": "ace/mode/java" },
        },
      },
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
      body: async (id) => ({
        schema: "course-body-package-v2",
        owner: "demo",
        release: "1",
        apiVersion: [1, 23, 1],
        questions: [
          {
            owner: "demo",
            id: "exr-a",
            key: "demo/exr-a",
            title: "Проверка",
            source: "a.qmd",
            visibility: "public",
            statementVisibility: "open",
            hasPublicSolution: false,
            answerType: "manual",
            condition: [],
            publicAnswer: [],
          },
        ],
        resources: [],
        works: [
          {
            owner: "demo",
            id,
            key: "demo/" + id,
            source: id + ".qmd",
            kind: "lab",
            title: "Проверка",
            introduction: [],
            slots: [
              {
                id: "demo/" + id + "/exr-a",
                selection: "fixed",
                candidates: ["demo/exr-a"],
                assignment,
              },
            ],
          },
        ],
      }),
      nativeInputs: {
        "exr-a": {
          sources: [{ name: "pkg/A.java", bytes }],
          tests: [
            {
              name: "ATest.java",
              bytes: new TextEncoder().encode("class ATest {} // PRIVATE_TEST"),
            },
          ],
          descriptor: runtimeDescriptor(
            check,
            { javaRelease: 25 },
            ["pkg/A.java"],
            ["ATest.java"],
          ),
        },
      },
      studentArtifact: async () => ({
        files: [{ name: "pkg/A.java", bytes }],
        archive: new Uint8Array([80, 75, 3, 4]),
      }),
    };
    const Command = Deno.Command;
    let pandocCalls = 0;
    Deno.Command = class extends Command {
      constructor(command: string | URL, options: Deno.CommandOptions = {}) {
        if (options.args?.[0] === "pandoc") pandocCalls++;
        super(command, options);
      }
    };
    const start = performance.now();
    try {
      await run(input, root, { pandocCalls: () => pandocCalls });
    } finally {
      Deno.Command = Command;
      console.info(
        "Короткие Pandoc children: " +
          JSON.stringify({
            calls: pandocCalls,
            milliseconds: Math.round(performance.now() - start),
          }),
      );
    }
  } finally {
    await Deno.remove(root, { recursive: true });
  }
}

Deno.test(
  "course writer uses checked Core target mappings to remove four renamed Java downloads",
  async () => {
    await inventoryCourseFixture(async (input) => {
      const project = required(input.checks.projects[0]);
      const sources = ["A.java", "B.java", "C.java", "D.java"].map((name) => ({
        name,
        bytes: new TextEncoder().encode("class " + name.slice(0, -5) + " {}\n"),
      }));
      project.sources = sources.map((file) =>
        selectedCheckFile(
          {
            target: "student/" + file.name,
            bytes: file.bytes,
          },
          file.name,
        ),
      );
      input.nativeInputs = {
        "exr-a": {
          sources,
          tests: [
            {
              name: "ATest.java",
              bytes: new TextEncoder().encode("PRIVATE_TEST"),
            },
          ],
          descriptor: runtimeDescriptor(
            project.check,
            { javaRelease: 25 },
            sources.map((file) => file.name),
            ["ATest.java"],
          ),
        },
      };
      input.config["question-defaults"] = {
        topic: "Java",
        submission: { mode: "upload", layout: "files" },
      };
      input.studentArtifact = async () => ({
        files: sources.map((file) => ({
          name: "student/" + file.name,
          bytes: file.bytes,
        })),
        archive: new Uint8Array([80, 75, 3, 4]),
      });
      await exportCourse(input);
      const base = input.output + "/questions/demo/exr-a";
      const html = await Deno.readTextFile(base + "/question.html");
      assert(
        html.includes('file-names="A.java,B.java,C.java,D.java"') &&
          !html.includes("<pl-file-download"),
        "renamed starter sources remain duplicated",
      );
      for (const source of sources) {
        const bytes = await Deno.readFile(
          base + "/clientFilesQuestion/starter/student/" + source.name,
        );
        assert(
          bytes.length === source.bytes.length &&
            bytes.every((byte, index) => byte === source.bytes[index]),
          "mapped starter bytes changed",
        );
        const duplicate = await Deno.stat(
          base + "/clientFilesQuestion/" + source.name,
        ).catch(() => undefined);
        assert(duplicate === undefined, "renamed source duplicated at root");
      }
    });
  },
);

for (const [kind, defense] of [
  ["lab", false],
  ["lab", true],
  ["seminar", false],
  ["test", false],
  ["practical", false],
] as const) {
  Deno.test(
    "closed assessment policy: " +
      kind +
      (defense ? " label override" : " ordinary"),
    async () => {
      await inventoryCourseFixture(async (input, root) => {
        const work = input.content.assessments[0];
        required(work).kind = kind;
        if (defense) {
          required(work).relatedExercise = "exr-a";
          required(work).extensions.prairielearn.assignment = {
            "student-label": "defense",
          };
        }
        required(input.config.delivery.instances.pilot).works = [
          required(work).id,
        ];
        const body = input.body;
        input.body = async (id) => {
          const pkg = await body(id);
          required(pkg.works[0]).kind = kind;
          if (kind === "test" || kind === "practical") {
            required(pkg.questions[0]).statementVisibility = "restricted";
          }
          return pkg;
        };
        await exportCourse(input);
        const info = record(
          JSON.parse(
            await Deno.readTextFile(
              root +
                "/out/courseInstances/pilot/assessments/" +
                required(work).id +
                "/infoAssessment.json",
            ),
          ),
        );
        const afterComplete = {
          questions: { hidden: false },
          score: { hidden: false },
        };
        const expectedRules = defense
          ? [
              {
                beforeRelease: { listed: false },
                dateControl: {
                  release: { date: "9999-12-31T00:00:00" },
                  due: { date: null },
                },
              },
              {
                uuid: await identity(
                  "access/pilot/" + required(work).id,
                  await identity("course/demo"),
                ),
                labels: ["defense"],
                dateControl: {
                  release: { date: "1970-01-01T00:00:00" },
                  due: { date: null },
                },
              },
            ]
          : [
              {
                dateControl: {
                  release: { date: "1970-01-01T00:00:00" },
                  due: { date: null },
                },
              },
            ];
        assert(
          JSON.stringify(info.accessControl) ===
            JSON.stringify(
              expectedRules.map((rule) =>
                kind === "lab" ? { ...rule, afterComplete } : rule,
              ),
            ),
          "Native access rules, dates, labels или видимость закрытой лабораторной изменены неверно",
        );
        assert(
          info.type ===
            (kind === "test" || kind === "practical" ? "Exam" : "Homework"),
          "Вид assessment изменён политикой просмотра",
        );
      });
    },
  );
}

Deno.test(
  "inventory: уникальный вопрос не перечитывается ради списка имён",
  async () => {
    await inventoryCourseFixture(async (input) => {
      required(input.config.delivery.instances.pilot).works = ["sec-first"];
      const read = Deno.readFile;
      const calls: { name: string; bytes: number }[] = [];
      Deno.readFile = async (path, options) => {
        const bytes = await read(path, options);
        calls.push({ name: String(path), bytes: bytes.length });
        return bytes;
      };
      let result;
      try {
        result = await exportCourse(input);
      } finally {
        Deno.readFile = read;
      }
      const inventoryReads = calls.filter((c) =>
        /\/(?:work-0|\.pl-course-[^/]+)\/questions\//.test(c.name),
      );
      console.info(
        "Готовые файлы: " +
          JSON.stringify({
            calls: inventoryReads.length,
            bytes: inventoryReads.reduce(
              (total, call) => total + call.bytes,
              0,
            ),
          }),
      );
      assert(
        inventoryReads.length === 0,
        "Полные байты готового вопроса прочитаны ради имён: " +
          JSON.stringify(inventoryReads),
      );
      const names: string[] = [];
      async function walk(path: string, prefix = "") {
        for await (const entry of Deno.readDir(path)) {
          const name = prefix + entry.name;
          if (entry.isDirectory)
            await walk(path + "/" + entry.name, name + "/");
          else if (name !== "delivery.json") names.push(name);
        }
      }
      await walk(input.output);
      assert(
        JSON.stringify(result.files) === JSON.stringify(names.sort()),
        "Список delivery не совпадает с реальными файлами",
      );
      const info = record(
        JSON.parse(
          await Deno.readTextFile(
            input.output + "/questions/demo/exr-a/info.json",
          ),
        ),
      );
      assert(
        info.partialCredit === true &&
          fixtureAt(info, ["preferences", "courseRequirement", "default"]) ===
            "required",
        "Финальные настройки вопроса потеряны",
      );
      assert(
        (await Deno.readTextFile(
          input.output + "/questions/demo/exr-a/tests/ATest.java",
        )) === "class ATest {} // PRIVATE_TEST",
        "Закрытые тесты потеряны",
      );
    });
  },
);

Deno.test(
  "inventory: одинаковый повтор рендерится один раз и проверяет реальные готовые байты",
  async () => {
    await inventoryCourseFixture(async (input, _root, metrics) => {
      const read = Deno.readFile;
      const calls: { name: string; bytes: number }[] = [];
      const readDir = Deno.readDir;
      Deno.readDir = async function* (path) {
        const entries = await Array.fromAsync(readDir(path));
        yield* entries.reverse();
      };
      Deno.readFile = async (path, options) => {
        const bytes = await read(path, options);
        calls.push({ name: String(path), bytes: bytes.length });
        return bytes;
      };
      let result;
      try {
        result = await exportCourse(input);
        assert(
          metrics.pandocCalls() === 3,
          "Повтор вызвал Pandoc заново: ожидаются два обзора и один вопрос",
        );
      } finally {
        Deno.readFile = read;
        Deno.readDir = readDir;
      }
      const names = calls.map((call) => call.name);
      const ready = calls.filter((call) =>
        /\/(?:work-\d+|\.pl-course-[^/]+)\/questions\//.test(call.name),
      );
      console.info(
        "Готовые файлы: " +
          JSON.stringify({
            calls: ready.length,
            bytes: ready.reduce((total, call) => total + call.bytes, 0),
          }),
      );
      const first = names.filter((name) => name.includes("/work-0/questions/"));
      assert(
        first.length === 0,
        "Первый готовый вопрос перечитан до появления коллизии",
      );
      const second = names
        .filter((name) => name.includes("/work-1/questions/"))
        .map((name) => name.split("/work-1/")[1])
        .sort();
      const staged = names
        .filter((name) => /\/\.pl-course-[^/]+\/questions\//.test(name))
        .map((name) => name.split(/\/\.pl-course-[^/]+\//)[1])
        .sort();
      assert(
        JSON.stringify(second) === JSON.stringify(staged) && second.length > 0,
        "Коллизия не сравнила оба готовых дерева",
      );
      assert(
        JSON.stringify(second) ===
          JSON.stringify(
            result.files
              .filter((name: string) => name.startsWith("questions/"))
              .sort(),
          ),
        "Коллизия пропустила готовые файлы",
      );
    });
  },
);

for (const conflict of [
  "archive",
  "private-test",
  "starter",
  "resource",
  "resource-binding",
  "public-question",
  "source-map",
  "grading-policy",
  "existing-file",
  "extra-file",
  "missing-file",
] as const) {
  Deno.test(
    "inventory: отказ при конфликте повторного вопроса — " + conflict,
    async () => {
      await inventoryCourseFixture(async (input, root, metrics) => {
        const body = input.body;
        input.body = async (id) => {
          const value = await body(id);
          if (conflict === "resource" || conflict === "resource-binding") {
            value.resources = [
              {
                owner: "demo",
                source: "a.qmd",
                effectiveBase: root,
                target: "diagram.svg",
                visibility: "public",
                data: btoa("<svg>1</svg>"),
              },
            ];
            required(value.questions[0]).condition = [
              {
                t: "Para",
                c: [
                  {
                    t: "Image",
                    c: [
                      ["", [], []],
                      [{ t: "Str", c: "Рисунок" }],
                      ["diagram.svg", ""],
                    ],
                  },
                ],
              },
            ];
          }
          if (id === "sec-second") {
            if (conflict === "archive") {
              const artifact = input.studentArtifact;
              input.studentArtifact = async (fact) => ({
                ...(await artifact(fact)),
                archive: new Uint8Array([80, 75, 3, 5]),
              });
            }
            if (conflict === "starter") {
              const bytes = required(
                required(input.nativeInputs["exr-a"]).sources[0],
              ).bytes;
              bytes[0] = required(bytes[0]) ^ 1;
            }
            if (conflict === "resource") {
              required(value.resources[0]).data = btoa("<svg>2</svg>");
            }
            if (conflict === "resource-binding") {
              required(value.resources[0]).effectiveBase = root + "/other";
            }
            if (conflict === "private-test") {
              const bytes = required(
                required(input.nativeInputs["exr-a"]).tests[0],
              ).bytes;
              bytes[0] = required(bytes[0]) ^ 1;
            }
            if (conflict === "public-question") {
              required(value.questions[0]).source = "other.qmd";
            }
            if (conflict === "grading-policy") {
              required(required(input.checks.projects[0]).check).scoring = {
                mode: "all-pass",
              };
            }
            if (conflict === "source-map") {
              required(required(input.checks.projects[0]).sources[0]).target =
                "student/other/A.java";
            }
            if (
              ["existing-file", "extra-file", "missing-file"].includes(conflict)
            ) {
              const stage = [...Deno.readDirSync(root)].find((entry) =>
                entry.name.startsWith(".pl-course-"),
              )!;
              const question =
                root + "/" + stage.name + "/questions/demo/exr-a";
              if (conflict === "existing-file") {
                await Deno.writeTextFile(
                  question + "/tests/ATest.java",
                  "ИЗМЕНЁННЫЕ РЕАЛЬНЫЕ БАЙТЫ",
                );
              }
              if (conflict === "extra-file") {
                await Deno.writeTextFile(
                  question + "/extra.txt",
                  "ДОПОЛНИТЕЛЬНЫЙ ФАЙЛ",
                );
              }
              if (conflict === "missing-file") {
                await Deno.remove(question + "/tests/ATest.java");
              }
            }
          }
          return value;
        };
        let error: unknown;
        try {
          await exportCourse(input);
        } catch (caught) {
          error = caught;
        }
        assert(
          String(error).includes("PL конфликт повторного вопроса"),
          "Конфликт не отклонён: " + String(error),
        );
        const sameInputs = [
          "existing-file",
          "extra-file",
          "missing-file",
        ].includes(conflict);
        assert(
          metrics.pandocCalls() === (sameInputs ? 3 : 4),
          "Повтор переиспользован при изменении входных данных: " + conflict,
        );
        for (const path of [input.output, input.checksOutput]) {
          assert(
            !(await Deno.lstat(path).then(
              () => true,
              () => false,
            )),
            "Конфликт опубликовал результат",
          );
        }
      });
    },
  );
}

for (const location of ["question", "course"] as const) {
  Deno.test(
    "inventory: символьная ссылка в готовой поставке отклоняется — " + location,
    async () => {
      await inventoryCourseFixture(async (input, root) => {
        const body = input.body;
        input.body = async (id) => {
          if (id === (location === "question" ? "sec-second" : "sec-first")) {
            const stage = [...Deno.readDirSync(root)].find((entry) =>
              entry.name.startsWith(".pl-course-"),
            )!;
            await Deno.symlink(
              root + "/project",
              root +
                "/" +
                stage.name +
                (location === "question"
                  ? "/questions/demo/exr-a/alias"
                  : "/alias"),
            );
          }
          return await body(id);
        };
        if (location === "course") {
          required(input.config.delivery.instances.pilot).works = ["sec-first"];
        }
        let error: unknown;
        try {
          await exportCourse(input);
        } catch (caught) {
          error = caught;
        }
        assert(
          String(error).includes("PL unexpected artifact"),
          "Символьная ссылка не отклонена: " + String(error),
        );
        assert(
          !(await Deno.lstat(input.output).then(
            () => true,
            () => false,
          )),
          "Отказ опубликовал курс",
        );
      });
    },
  );
}

Deno.test(
  "inventory: fresh output повторно проверяется перед публикацией",
  async () => {
    await inventoryCourseFixture(async (input, root) => {
      required(input.config.delivery.instances.pilot).works = ["sec-first"];
      const prepared = await exportCourse({ ...input, deferPublish: true });
      await Deno.symlink(root + "/project", input.output);
      let error: unknown;
      try {
        await prepared.publish();
      } catch (caught) {
        error = caught;
      }
      assert(
        String(error).includes("PL fresh output required"),
        "Занятый output принят: " + String(error),
      );
      assert(
        (await Deno.lstat(input.output)).isSymlink,
        "Чужой output заменён",
      );
      assert(
        !(await Deno.lstat(input.checksOutput).then(
          () => true,
          () => false,
        )),
        "Отказ опубликовал private checks",
      );
    });
  },
);

for (const kind of ["course", "instance", "question"]) {
  Deno.test(
    "inventory: assessment UUID collision with " +
      kind +
      " is rejected before publication",
    async () => {
      await inventoryCourseFixture(async (input) => {
        const course = await identity("course/demo");
        const collision =
          kind === "course"
            ? course
            : kind === "instance"
              ? await identity("instance/pilot", course)
              : await (
                  await import("../_extensions/course-prairielearn/application/export.ts")
                ).uuid("demo/exr-a");
        required(input.content.assessments[0]).extensions.prairielearn.uuid =
          collision.toUpperCase();
        let error: unknown;
        try {
          await exportCourse(input);
        } catch (caught) {
          error = caught;
        }
        assert(
          String(error).includes("повторный UUID"),
          "Cross-kind collision accepted: " + error,
        );
        for (const path of [input.output, input.checksOutput]) {
          assert(
            !(await Deno.lstat(path).then(
              () => true,
              () => false,
            )),
            "Collision published output",
          );
        }
      });
    },
  );
}

Deno.test(
  "inventory: одинаковые Unicode имена не зависят от порядка обхода",
  async () => {
    await inventoryCourseFixture(async (input) => {
      const artifact = input.studentArtifact;
      input.studentArtifact = async (fact) => {
        const value = await artifact(fact);
        return {
          ...value,
          files: [
            ...value.files,
            { name: "é.txt", bytes: new Uint8Array([1]) },
            { name: "e\u0301.txt", bytes: new Uint8Array([2]) },
          ],
        };
      };
      const readDir = Deno.readDir;
      Deno.readDir = async function* (path) {
        const entries = await Array.fromAsync(readDir(path));
        entries.sort((left, right) =>
          left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
        );
        yield* String(path).includes("/.pl-course-")
          ? entries.reverse()
          : entries;
      };
      try {
        const result = await exportCourse(input);
        assert(
          result.files.includes(
            "questions/demo/exr-a/clientFilesQuestion/starter/é.txt",
          ),
          "Имя NFC потеряно",
        );
        assert(
          result.files.includes(
            "questions/demo/exr-a/clientFilesQuestion/starter/e\u0301.txt",
          ),
          "Имя NFD потеряно",
        );
      } finally {
        Deno.readDir = readDir;
      }
    });
  },
);

Deno.test(
  "integer manual course option is opt-in, survives native output, and rejects fractional maxima before publication",
  async () => {
    for (const enabled of [undefined, false, true]) {
      await inventoryCourseFixture(async (input) => {
        if (enabled !== undefined)
          input.config.delivery.course.options = {
            integerManualPoints: enabled,
          };
        if (enabled === false)
          for (const work of input.content.assessments) {
            work.extensions.prairielearn = {
              ...work.extensions.prairielearn,
              "question-points": 2.5,
            };
          }
        await exportCourse(input);
        const course = record(
          JSON.parse(
            await Deno.readTextFile(input.output + "/infoCourse.json"),
          ),
        );
        if (enabled === undefined)
          assert(!Object.hasOwn(course, "options"), "default changed");
        else
          assert(
            record(course.options).integerManualPoints === enabled,
            "explicit opt-in lost",
          );
      });
    }
    await inventoryCourseFixture(async (input) => {
      input.config.delivery.course.options = { integerManualPoints: true };
      for (const work of input.content.assessments)
        work.extensions.prairielearn = {
          ...work.extensions.prairielearn,
          "question-points": 2.5,
        };
      let failure = "";
      try {
        await exportCourse(input);
      } catch (error) {
        failure = String(error);
      }
      assert(
        failure.includes("PL.GRADING_INVALID:") &&
          failure.includes("integerManualPoints"),
        "fractional maximum accepted",
      );
      let absent = false;
      try {
        await Deno.stat(input.output);
      } catch (error) {
        absent = error instanceof Deno.errors.NotFound;
      }
      assert(absent, "invalid policy published native output");
    });
  },
);
