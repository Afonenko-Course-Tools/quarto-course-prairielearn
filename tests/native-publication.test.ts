// Ограниченный lifecycle harness; scope callbacks здесь НЕ genuine Core operation/prior P.
import { exportPrairieLearn } from "../_extensions/course-prairielearn/application/export.ts";
import { exportCourse } from "../_extensions/course-prairielearn/application/export-course.ts";
import {
  bindNativePublication,
  withNativeStagedOutput,
} from "../_extensions/course-prairielearn/application/native-course.ts";
import { publishNativePrepared } from "../_extensions/course-prairielearn/application/native-entry.ts";
import { checkedJSON } from "../_extensions/course-prairielearn/application/native-materialize.ts";
import { captureNativeAuxiliary } from "../_extensions/course-prairielearn/application/native-auxiliary.ts";
function assert(v: unknown, m: string): asserts v {
  if (!v) throw Error(m);
}
async function reject(f: () => Promise<unknown>, m: string) {
  let error = "";
  try {
    await f();
  } catch (e) {
    error = String(e);
  }
  assert(error.includes(m), "Ожидался " + m + ", получено " + error);
}
async function fixture(course: boolean) {
  const root = await Deno.makeTempDir({ prefix: "pl-c5-publish-" }),
    out = root + "/out",
    privateOut = root + "/checks.json",
    events: string[] = [];
  const answer = { type: "manual", submission: "text" },
    id = "exr-answer",
    key = "fixture/" + id;
  const work = {
    id: "sec-work",
    source: "work.qmd",
    kind: "lab",
    title: "Работа",
    slots: [{
      id,
      selection: "fixed",
      candidates: [id],
      assignment: { requirement: "required", workMode: "individual" },
    }],
    extensions: {
      prairielearn: {
        attempts: 3,
        pass: { "at-least": 1 },
        assignment: { "student-label": "test" },
        "auto-points": 0,
        "manual-points": 20,
      },
    },
  };
  const pkg = {
    schema: "course-body-package-v2",
    owner: "fixture",
    release: "native",
    apiVersion: [1, 23, 1],
    questions: [{
      owner: "fixture",
      id,
      key,
      title: "Форма",
      source: "bank.qmd",
      visibility: "public",
      statementVisibility: "open",
      hasPublicSolution: false,
      answerType: "manual",
      condition: [{ t: "Para", c: [{ t: "Str", c: "PUBLIC_CONDITION" }] }],
      publicAnswer: [],
    }],
    works: [{
      id: work.id,
      source: work.source,
      kind: work.kind,
      title: work.title,
      owner: "fixture",
      key: "fixture/sec-work",
      slots: [{
        ...work.slots[0],
        id: "fixture/sec-work/" + id,
        candidates: [key],
      }],
    }],
    resources: [],
  };
  const config = {
    delivery: {
      book: "tasks",
      course: {
        name: "FIXTURE",
        title: "Проверка",
        timezone: "Europe/Minsk",
        topics: [{ name: "Java", color: "blue2", description: "Java" }],
      },
      instances: {
        test: {
          title: "Проверка",
          "self-enrollment": false,
          publishing: {
            "start-date": "1970-01-01T00:00:00Z",
            "end-date": "9999-12-31T00:00:00Z",
          },
          works: ["sec-work"],
        },
      },
    },
    "question-defaults": { topic: "Java", submission: { mode: "upload" } },
  };
  const dependencies: { path: string; assert: () => Promise<void> }[] = [];
  for (const name of ["binding", "catalog", "registry"]) {
    const path = root + "/" + name + ".json";
    await Deno.writeTextFile(path, '{"fixture":"initial"}');
    dependencies.push({ path, ...await checkedJSON(path) });
  }
  let live = true;
  const auxiliary = captureNativeAuxiliary(async () => {
    assert(live, "OPERATION_EXPIRED");
    events.push("live");
  });
  const build = async () => {
    const value = course
      ? await exportCourse({
        courseId: "fixture",
        projectRoot: root,
        content: {
          assessments: [work],
          exercises: [{
            id,
            target: "prairielearn",
            extensions: { prairielearn: { grading: { method: "manual" } } },
          }],
          projects: [],
        },
        checks: {
          schemaVersion: 1,
          courseId: "fixture",
          bookRoot: "tasks",
          sourceSnapshotHash: "a".repeat(64),
          inventoryHash: "b".repeat(64),
          projects: [],
        },
        registry: { schemaVersion: 1, profiles: {} },
        config,
        instance: "test",
        output: out,
        checksOutput: privateOut,
        body: async () => pkg,
        nativeAnswers: { [id]: answer },
        nativeResponseSlots: {
          [id]: [{
            name: "answer",
            type: "manual",
            anchor: "fixture-response-0",
          }],
        },
        nativeAuxiliary: auxiliary,
        deferPublish: true,
      })
      : await exportPrairieLearn(pkg, {
        projectRoot: root,
        projects: {},
        nativeAnswers: { [id]: answer },
        nativeAuxiliary: auxiliary,
        deferPublish: true,
      }, {
        questions: {
          [id]: {
            topic: "Java",
            grading: { method: "manual" },
            submission: { mode: "upload" },
            files: [],
          },
        },
      }, out);
    assert(value, "prepared handle missing");
    events.push("builder");
    const actualPublish = value.publish, actualDiscard = value.discard;
    return bindNativePublication({
      ...value,
      publish: async () => {
        events.push("publish");
        return await actualPublish();
      },
      discard: async () => {
        events.push("discard");
        await actualDiscard();
      },
    }, async () => {
      assert(!live, "publish before Core closing");
      events.push("bindings");
      for (const d of dependencies) await d.assert();
    });
  };
  const scope = async (use: (v: any) => Promise<any>) => {
    const result = await use({ harness: "not-authority" });
    events.push("A1-close");
    events.push("Core-close");
    live = false;
    return result;
  };
  const clean = async () => {
    const names = [];
    for await (const e of Deno.readDir(root)) names.push(e.name);
    assert(!names.some((n) => n.startsWith(".pl-")), "Staged output leaked");
    assert(
      !names.includes("out") && !names.includes("checks.json"),
      "Output published after refusal",
    );
  };
  return {
    root,
    out,
    privateOut,
    events,
    dependencies,
    build,
    scope,
    close: () => {
      live = false;
    },
    clean,
  };
}
for (const course of [false, true]) {
  const label = course ? "course" : "standalone";
  Deno.test(
    label +
      ": настоящий deferred builder публикует после Core-close без expired live guard",
    async () => {
      const f = await fixture(course);
      try {
        let prepared: any;
        await publishNativePrepared(f.scope, async () => {
          prepared = await f.build();
          return prepared;
        });
        const tail = f.events.filter((e) => e !== "live");
        assert(
          JSON.stringify(tail) ===
            JSON.stringify([
              "builder",
              "A1-close",
              "Core-close",
              "bindings",
              "publish",
            ]),
          "Неверный порядок " + tail,
        );
        assert((await Deno.stat(f.out)).isDirectory, "Нет output");
        if (course) {
          assert((await Deno.stat(f.privateOut)).isFile, "Нет checks");
        }
        await reject(() => prepared.publish(), "already consumed");
      } finally {
        await Deno.remove(f.root, { recursive: true });
      }
    },
  );
  Deno.test(
    label +
      ": parent closing rejection после inner assignment сохраняет handle и discard",
    async () => {
      const f = await fixture(course);
      try {
        await reject(() =>
          publishNativePrepared(async (use) => {
            await use({ harness: true });
            f.close();
            throw Error("CORE_CLOSING_FAILURE");
          }, f.build), "CORE_CLOSING_FAILURE");
        await f.clean();
        assert(
          f.events.includes("discard") && !f.events.includes("publish"),
          "Handle потерян на RHS rejection",
        );
      } finally {
        await Deno.remove(f.root, { recursive: true });
      }
    },
  );
  Deno.test(
    label +
      ": post-callback binding/catalog/registry drift отказывает и удаляет stages",
    async () => {
      for (let index = 0; index < 3; index++) {
        const f = await fixture(course);
        try {
          await reject(() =>
            publishNativePrepared(async (use) => {
              const value = await f.scope(use);
              await Deno.writeTextFile(
                f.dependencies[index].path,
                '{"fixture":"DRIFT"}',
              );
              return value;
            }, f.build), "PL.INPUT_CHANGED");
          await f.clean();
          assert(!f.events.includes("publish"), "Rename после drift");
        } finally {
          await Deno.remove(f.root, { recursive: true });
        }
      }
    },
  );
  Deno.test(
    label +
      ": fresh-output collision не перезаписывает файл и удаляет private stage",
    async () => {
      const f = await fixture(course);
      try {
        await reject(() =>
          publishNativePrepared(async (use) => {
            const value = await f.scope(use);
            await Deno.writeTextFile(f.out, "EXISTING");
            return value;
          }, f.build), course ? "fresh" : "fresh");
        assert(
          await Deno.readTextFile(f.out) === "EXISTING",
          "Existing output overwritten",
        );
        await Deno.remove(f.out);
        await f.clean();
      } finally {
        await Deno.remove(f.root, { recursive: true });
      }
    },
  );
}
for (const course of [false, true]) {
  Deno.test(
    (course ? "course" : "standalone") +
      ": A1 closing failure после saved builder удаляет настоящие stages",
    async () => {
      const f = await fixture(course);
      try {
        await reject(() =>
          withNativeStagedOutput(async (save) => {
            const prepared = await f.build();
            save(prepared);
            // Callback уже вернул prepared handle; здесь имитируется только closing throw,
            // а не genuine Core operation/authority.
            await Promise.resolve();
            throw Error("A1_CLOSING_FAILURE");
          }), "A1_CLOSING_FAILURE");
        await f.clean();
        assert(
          f.events.includes("discard") && !f.events.includes("publish"),
          "A1 close выпустил stage",
        );
      } finally {
        await Deno.remove(f.root, { recursive: true });
      }
    },
  );
}
Deno.test("Course rollback после private rename удаляет private output при ошибке второго rename", async () => {
  const f = await fixture(true), actual = Deno.rename;
  let privateVisible = false;
  try {
    (Deno as any).rename = async (from: string, to: string) => {
      if (to === f.out) {
        privateVisible = await Deno.stat(f.privateOut).then(
          (s) => s.isFile,
          () => false,
        );
        throw Error("SECOND_RENAME_FAILURE");
      }
      return await actual(from, to);
    };
    await reject(
      () => publishNativePrepared(f.scope, f.build),
      "SECOND_RENAME_FAILURE",
    );
    assert(privateVisible, "Private-first порядок потерян");
    await f.clean();
  } finally {
    (Deno as any).rename = actual;
    await Deno.remove(f.root, { recursive: true });
  }
});
