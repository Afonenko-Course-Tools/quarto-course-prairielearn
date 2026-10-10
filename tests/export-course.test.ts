import {
  declarations,
  question,
} from "../_extensions/course-prairielearn/application/declarations.ts";
import { selectedSources } from "../_extensions/course-prairielearn/application/source-selection.ts";
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
        zones: [{ questions: [pooled ? { alternatives: [member] } : member] }],
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
Deno.test("selected sources preserve package paths and reject build scripts", async () => {
  const root = await Deno.makeTempDir();
  try {
    await Deno.mkdir(root + "/student/src/main/java/pkg", { recursive: true });
    await Deno.writeTextFile(
      root + "/student/src/main/java/pkg/A.java",
      "class A {}",
    );
    const bytes = await Deno.readFile(
      root + "/student/src/main/java/pkg/A.java",
    );
    const sha256 = [
      ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    ].map((b) => b.toString(16).padStart(2, "0")).join("");
    const p = {
      check: {
        sourceProfile: {
          root: "student/src/main/java",
          mode: "implementation",
        },
      },
      sources: [{
        projectRelativePath: "student/src/main/java/pkg/A.java",
        submissionRelativePath: "pkg/A.java",
        sha256,
      }],
    };
    const files = await selectedSources(root, p);
    assert(files[0].name === "pkg/A.java", "package stripped");
    p.sources[0].submissionRelativePath = "build.gradle";
    let rejected = false;
    try {
      await selectedSources(root, p);
    } catch {
      rejected = true;
    }
    assert(rejected, "build accepted");
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
import {
  exportCourse,
  identity,
} from "../_extensions/course-prairielearn/application/export-course.ts";
import {
  canonical,
  hash,
} from "../_extensions/course-prairielearn/application/source-selection.ts";
Deno.test("full native export is deterministic, closed and atomic across output filesystems", async () => {
  const root = await Deno.makeTempDir(Deno.env.get("PL_EXDEV_TEST_DIR") ? {dir:Deno.env.get("PL_EXDEV_TEST_DIR")} : {});
  try {
    for (
      const dir of ["student/src/main/java/pkg", "tests/junit", "reference"]
    ) await Deno.mkdir(root + "/project/" + dir, { recursive: true });
    const source = "package pkg; class A { // Пример 😀 {{literal}}\n}";
    await Deno.writeTextFile(
      root + "/project/student/src/main/java/pkg/A.java",
      source,
    );
    await Deno.writeTextFile(
      root + "/project/tests/junit/ATest.java",
      "class ATest {}",
    );
    await Deno.writeTextFile(
      root + "/project/reference/A.java",
      "PRIVATE_REFERENCE",
    );
    const selection = {
      projectRelativePath: "student/src/main/java/pkg/A.java",
      submissionRelativePath: "pkg/A.java",
      sha256: await hash(source),
    };
    const test = {
      projectRelativePath: "tests/junit/ATest.java",
      submissionRelativePath: "ATest.java",
      sha256: await hash("class ATest {}"),
    };
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
    const assignment = { requirement: "required", workMode: "individual" };
    const work = {
      id: "sec-lab",
      source: "lab.qmd",
      kind: "lab",
      title: "Lab",
      items: ["exr-a"],
      assignments: { "exr-a": assignment },
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
    const check = {
      profile: "java",
      runtime: "junit",
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
      scoring: { mode: "weighted" },
      discovery: { "min-executed": 1, "allow-skipped": false },
    };
    const fact = {
      exerciseId: "exr-a",
      bankMember: true,
      projectRoot: "project",
      check,
      sources: [selection],
      trustedTests: [test],
    };
    const body = {
      schema: "course-body-package-v1",
      owner: "demo",
      release: "1",
      apiVersion: [1, 23, 1],
      questions: [{
        owner: "demo",
        id: "exr-a",
        key: "demo/exr-a",
        source: "a.qmd",
        visibility: "public",
        statementVisibility: "open",
        hasPublicSolution: false,
        answerType: "manual",
        condition: [{ t: "Para", c: [{ t: "Str", c: "PUBLIC_CONDITION" }] }],
        publicAnswer: [],
      }],
      resources: [],
      works: [{
        owner: "demo",
        id: "sec-lab",
        key: "demo/sec-lab",
        source: "lab.qmd",
        kind: "lab",
        title: "Lab",
        items: ["demo/exr-a"],
        assignments: { "demo/exr-a": assignment },
      }],
    };
    const input: any = {
      courseId: "demo",
      projectRoot: root,
      result: {
        model: {
          assessments: [work],
          exercises: [{ id: "exr-a", target: "prairielearn" }],
        },
      },
      checks: {
        schemaVersion: 1,
        courseId: "demo",
        bookRoot: "tasks",
        sourceSnapshotHash: "a".repeat(64),
        inventoryHash: "b".repeat(64),
        projects: [fact, {
          ...fact,
          exerciseId: "exr-checked-demo",
          bankMember: false,
        }],
      },
      config,
      registry: {
        schemaVersion: 1,
        profiles: {
          junit: {
            mode: "implementation",
            image: "registry/image@sha256:" + "c".repeat(64),
          },
        },
      },
      instance: "pilot",
      body: async () => body,
    };
    const a = await exportCourse({
      ...input,
      output: root + "/one",
      checksOutput: root + "/checks1.json",
    });
    const b = await exportCourse({
      ...input,
      output: root + "/two",
      checksOutput: root + "/checks2.json",
    });
    assert(canonical(a) === canonical(b), "exports differ");
    const repeatInfo = JSON.parse(
      await Deno.readTextFile(root + "/one/questions/demo/exr-a/info.json"),
    );
    assert(
      repeatInfo.singleVariant === false,
      "course repeat false lost in full export",
    );
    for (const [name, sha] of Object.entries(a.files)) {
      assert(
        await hash(await Deno.readFile(root + "/one/" + name)) === sha,
        "inventory mismatch",
      );
      assert(
        await hash(await Deno.readFile(root + "/two/" + name)) === sha,
        "bytes differ",
      );
    }
    const html = await Deno.readTextFile(
      root + "/one/questions/demo/exr-a/question.html",
    );
    assert(
      html.includes("Пример 😀") && !html.includes("{{literal}}") &&
        !html.includes("PRIVATE_REFERENCE"),
      "source escaped/leak",
    );
    assert(
      a.questions.length === 1 && a.questions[0] === "demo/exr-a",
      "manual checked demonstration exported",
    );
    const privateChecks = JSON.parse(
      await Deno.readTextFile(root + "/checks1.json"),
    );
    assert(
      privateChecks.projects.length === 2,
      "checked demonstration lost from private inventory",
    );
    for (
      const change of [() => {
        fact.check = undefined as any;
      }, () => {
        input.registry.profiles.junit.image = null;
      }, () => {
        input.config.delivery.course.extra = true;
      }]
    ) {
      const original = structuredClone({
        fact,
        inputConfig: input.config,
        registry: input.registry,
      });
      change();
      let failed = false;
      try {
        await exportCourse({
          ...input,
          output: root + "/bad",
          checksOutput: root + "/checksBad.json",
        });
      } catch {
        failed = true;
      }
      assert(failed, "invalid export accepted");
      Object.assign(fact, original.fact);
      input.config = original.inputConfig;
      input.registry = original.registry;
      let exists = true;
      try {
        await Deno.stat(root + "/bad");
      } catch (e) {
        exists = !(e instanceof Deno.errors.NotFound);
      }
      assert(!exists, "partial output published");
    }
    const ids = ["exr-a", "exr-b", "exr-c"],
      three: any = structuredClone(work),
      threeBody: any = structuredClone(body);
    const missingPoints = structuredClone(work);
    delete (missingPoints.extensions.prairielearn as any)["question-points"];
    let missingDiagnostic = "", missingBodyCalled = false;
    try {
      await exportCourse({
        ...input,
        result: {
          model: { ...input.result.model, assessments: [missingPoints] },
        },
        output: root + "/missing-points",
        checksOutput: root + "/missing-points-checks.json",
        body: async () => {
          missingBodyCalled = true;
          return body;
        },
      });
    } catch (e) {
      missingDiagnostic = String(e);
    }
    assert(
      !missingBodyCalled &&
        missingDiagnostic.includes("question-points (exr-a)") &&
        missingDiagnostic.includes("assessment-defaults"),
      "missing points did not fail actionable before native body collection",
    );
    for (
      const output of [
        root + "/missing-points",
        root + "/missing-points-checks.json",
      ]
    ) {
      let absent = false;
      try {
        await Deno.stat(output);
      } catch (e) {
        absent = e instanceof Deno.errors.NotFound;
      }
      assert(absent, "missing explicit points published partial output");
    }
    three.items = ids;
    three.assignments = Object.fromEntries(
      ids.map((
        id,
        i,
      ) => [id, {
        ...assignment,
        requirement: i === 2 ? "optional" : "required",
      }]),
    );
    three.extensions.prairielearn.pass["at-least"] = 2;
    threeBody.questions = ids.map((id) => ({
      ...structuredClone(body.questions[0]),
      id,
      key: "demo/" + id,
    }));
    threeBody.works[0].items = ids.map((id) => "demo/" + id);
    threeBody.works[0].assignments = Object.fromEntries(
      ids.map((id) => ["demo/" + id, three.assignments[id]]),
    );
    const threeDelivery = await exportCourse({
      ...input,
      result: {
        model: {
          assessments: [three],
          exercises: ids.map((id) => ({ id, target: "prairielearn" })),
        },
      },
      checks: {
        ...input.checks,
        projects: ids.map((id) => ({ ...fact, exerciseId: id })),
      },
      body: async () => threeBody,
      output: root + "/three",
      checksOutput: root + "/checks3.json",
    });
    const instance = JSON.parse(
      await Deno.readTextFile(
        root + "/three/courseInstances/pilot/infoCourseInstance.json",
      ),
    );
    assert(
      !Object.hasOwn(instance, "allowAccess") &&
        instance.selfEnrollment.enabled === false,
      "modern selfEnrollment conflicts with legacy allowAccess in native sync",
    );
    assert(
      instance.publishing.startDate === "1970-01-01T00:00:00Z" &&
        instance.publishing.endDate === "9999-12-31T00:00:00Z",
      "explicit publishing lost: native Students require instance availability",
    );
    assert(
      instance.studentLabels.length === 0,
      "ordinary lab incorrectly declares defense assignment labels",
    );
    assert(
      !threeDelivery.works[0].policy.assignment,
      "ordinary lab delivery requires a defense assignment slot",
    );
    assert(
      threeDelivery.works[0].policy["question-points"] === 2.5 &&
        threeDelivery.works[0].policy["max-points"] === 12,
      "ordinary lab grading metadata stripped from delivery",
    );
    const native = JSON.parse(
      await Deno.readTextFile(
        root +
          "/three/courseInstances/pilot/assessments/sec-lab/infoAssessment.json",
      ),
    );
    assert(
      native.accessControl.length === 1 && !native.accessControl[0].labels &&
        native.accessControl[0].dateControl.release.date ===
          "1970-01-01T00:00:00",
      "ordinary lab requires assignment label instead of joined Student access",
    );
    assert(
      native.maxPoints === 12,
      "completion threshold substituted for raw native points",
    );
    assert(
      native.zones[0].questions[2].preferences.courseRequirement === "optional",
      "native assignment fact lost",
    );
    for (const member of native.zones[0].questions) {
      const question = JSON.parse(
        await Deno.readTextFile(
          root + "/three/questions/" + member.id + "/info.json",
        ),
      );
      const field = question.preferences?.courseRequirement;
      assert(
        field?.type === "string" && field.default === "required" &&
          JSON.stringify(field.enum) ===
            JSON.stringify(["required", "optional"]),
        "native sync requires question-declared preferences schema for assessment overrides",
      );
      assert(
        infoQuestion(question),
        "preferences declaration violates pinned native schema",
      );
      assert(
        field.enum.includes(member.preferences.courseRequirement),
        "native preference override outside enum",
      );
      assert(
        !infoQuestion({
          ...question,
          preferences: { courseRequirement: { ...field, unknown: true } },
        }),
        "upstream preferences fields must remain closed",
      );
    }
    assert(
      threeDelivery.works[0].completion.atLeast === 2 &&
        threeDelivery.works[0].completion.requiredQuestionIds.length === 2,
      "authoritative required completion not sealed",
    );
    assert(
      native.type === "Homework" &&
        native.zones[0].questions.every((q: any) =>
          q.points === 2.5 && q.maxPoints === 6
        ),
      "Homework point ceilings changed",
    );
    for (const kind of ["test", "practical"]) {
      const examWork = structuredClone(three);
      examWork.kind = kind;
      examWork.extensions.prairielearn["question-max-points"] = null;
      examWork.extensions.prairielearn["question-points"] = [4, 2];
      const exported = await exportCourse({
        ...input,
        result: {
          model: {
            assessments: [examWork],
            exercises: ids.map((id) => ({ id, target: "prairielearn" })),
          },
        },
        checks: {
          ...input.checks,
          projects: ids.map((id) => ({ ...fact, exerciseId: id })),
        },
        body: async () => threeBody,
        output: root + "/exam-" + kind,
        checksOutput: root + "/exam-" + kind + ".json",
      });
      const exam = JSON.parse(
        await Deno.readTextFile(
          root + "/exam-" + kind +
            "/courseInstances/pilot/assessments/sec-lab/infoAssessment.json",
        ),
      );
      assert(
        exam.type === "Exam" && exam.maxPoints === 12,
        "Exam assessment score changed",
      );
      assert(
        exam.zones[0].questions.every((q: any) =>
          JSON.stringify(q.points) === JSON.stringify([4, 2]) &&
          !Object.hasOwn(q, "maxPoints") &&
          !Object.hasOwn(q, "maxAutoPoints") &&
          q.triesPerVariant === examWork.extensions.prairielearn.attempts
        ),
        "pinned native sync forbids per-question maxPoints/maxAutoPoints on Exam",
      );
      assert(
        canonical(exported.works[0].completion) ===
          canonical(threeDelivery.works[0].completion),
        "Exam completion predicate changed",
      );
    }
    const defense = structuredClone(three);
    defense.relatedExercise = "exr-essay";
    const defenseDelivery = await exportCourse({
      ...input,
      result: {
        model: {
          assessments: [defense],
          exercises: ids.map((id) => ({ id, target: "prairielearn" })),
        },
      },
      checks: {
        ...input.checks,
        projects: ids.map((id) => ({ ...fact, exerciseId: id })),
      },
      body: async () => threeBody,
      output: root + "/defense",
      checksOutput: root + "/checksDefense.json",
    });
    const defenseInfo = JSON.parse(
      await Deno.readTextFile(
        root +
          "/defense/courseInstances/pilot/assessments/sec-lab/infoAssessment.json",
      ),
    );
    const defenseInstance = JSON.parse(
      await Deno.readTextFile(
        root + "/defense/courseInstances/pilot/infoCourseInstance.json",
      ),
    );
    assert(
      defenseInstance.studentLabels.length === 1 &&
        defenseInfo.accessControl.length === 2 &&
        defenseInfo.accessControl[0].beforeRelease.listed === false &&
        defenseInfo.accessControl[1].labels[0] === "test",
      "explicit essay defense lost closed native label gate",
    );
    assert(
      defenseDelivery.works[0].relatedExercise === "exr-essay" &&
        defenseDelivery.works[0].policy.assignment["student-label"] === "test",
      "defense relation or assignment policy lost",
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
Deno.test("selected editor sources reject missing, binary, NUL, oversized, stale and symlink inputs", async () => {
  const root = await Deno.makeTempDir();
  try {
    await Deno.mkdir(root + "/student");
    const path = root + "/student/A.java";
    const p: any = {
      check: { sourceProfile: { root: "student", mode: "implementation" } },
      sources: [{
        projectRelativePath: "student/A.java",
        submissionRelativePath: "A.java",
        sha256: "a".repeat(64),
      }],
    };
    for (
      const bytes of [
        new Uint8Array([255]),
        new TextEncoder().encode("class A {\0}"),
        new Uint8Array(1024 * 1024 + 1),
      ]
    ) {
      await Deno.writeFile(path, bytes);
      p.sources[0].sha256 = await hash(bytes);
      let refused = false;
      try {
        await selectedSources(root, p);
      } catch {
        refused = true;
      }
      assert(refused, "unsafe source accepted");
    }
    await Deno.writeTextFile(path, "class A {}");
    p.sources[0].sha256 = "b".repeat(64);
    let refused = false;
    try {
      await selectedSources(root, p);
    } catch {
      refused = true;
    }
    assert(refused, "stale source accepted");
    await Deno.remove(path);
    refused = false;
    try {
      await selectedSources(root, p);
    } catch {
      refused = true;
    }
    assert(refused, "missing source accepted");
    await Deno.writeTextFile(root + "/secret", "secret");
    await Deno.symlink(root + "/secret", path);
    refused = false;
    try {
      await selectedSources(root, p);
    } catch {
      refused = true;
    }
    assert(refused, "symlink accepted");
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
Deno.test("student-tests source profile preserves suite path as answer", async () => {
  const root = await Deno.makeTempDir();
  try {
    await Deno.mkdir(root + "/student/src/test/java/demo", { recursive: true });
    const text = "package demo; class ATest {}";
    await Deno.writeTextFile(
      root + "/student/src/test/java/demo/ATest.java",
      text,
    );
    const p = {
      check: {
        sourceProfile: { root: "student/src/test/java", mode: "student-tests" },
      },
      sources: [{
        projectRelativePath: "student/src/test/java/demo/ATest.java",
        submissionRelativePath: "demo/ATest.java",
        sha256: await hash(text),
      }],
    };
    assert(
      (await selectedSources(root, p))[0].name === "demo/ATest.java",
      "suite path lost",
    );
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
});
Deno.test("multiple_selected_defenses_for_one_essay reject before source collection", async () => {
  const root = await Deno.makeTempDir();
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
            works: ["sec-one", "sec-two"],
          },
        },
      },
      "question-defaults": { topic: "Java", submission: { mode: "editor" } },
    };
    const works = ["sec-one", "sec-two"].map((id) => ({
      id,
      relatedExercise: "exr-essay",
      extensions: { prairielearn: {} },
    }));
    let called = false;
    let message = "";
    try {
      await exportCourse({
        courseId: "demo",
        projectRoot: root,
        result: { model: { assessments: works } },
        checks: {},
        config,
        registry: {},
        instance: "pilot",
        output: root + "/native",
        checksOutput: root + "/checks.json",
        body: async () => {
          called = true;
          throw new Error("unexpected body");
        },
      });
    } catch (e) {
      message = String(e);
    }
    assert(
      message.includes("duplicate active defense") && !called,
      "duplicate selected relation accepted",
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
Deno.test("reference private and public test partitions cannot become implementation submissions", async () => {
  const root = await Deno.makeTempDir();
  try {
    for (
      const sourceRoot of [
        "reference",
        "tests",
        "private",
        "student/src/test/java",
      ]
    ) {
      await Deno.mkdir(root + "/" + sourceRoot, { recursive: true });
      const text = "class A {}";
      await Deno.writeTextFile(root + "/" + sourceRoot + "/A.java", text);
      let rejected = false;
      try {
        await selectedSources(root, {
          check: {
            sourceProfile: { root: sourceRoot, mode: "implementation" },
          },
          sources: [{
            projectRelativePath: sourceRoot + "/A.java",
            submissionRelativePath: "A.java",
            sha256: await hash(text),
          }],
        });
      } catch {
        rejected = true;
      }
      assert(rejected, "private/public test source admitted: " + sourceRoot);
    }
  } finally {
    await Deno.remove(root, { recursive: true });
  }
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
