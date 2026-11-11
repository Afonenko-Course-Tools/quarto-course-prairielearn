import { required } from "./fixture-values.ts";
import type { AnswerSpec } from "course-core/public.ts";
import type { PublicBodyPackage } from "course-core/body-export/model.ts";
// Ограниченный lifecycle harness; scope callbacks здесь НЕ genuine Core operation/prior P.
import { exportPrairieLearn } from "../_extensions/course-prairielearn/application/export.ts";
import { exportCourse } from "../_extensions/course-prairielearn/application/export-course.ts";
import {
  withNativeStagedOutput,
} from "../_extensions/course-prairielearn/application/native-course.ts";
import { publishNativePrepared } from "../_extensions/course-prairielearn/application/native-entry.ts";
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
  const answer: Extract<AnswerSpec, { type: "manual" }> = {
    type: "manual",
    submission: "text",
  };
  const id = "exr-answer",
    key = "fixture/" + id;
  const kind: PublicBodyPackage["works"][number]["kind"] = "lab";
  const selection:
    PublicBodyPackage["works"][number]["slots"][number]["selection"] = "fixed";
  const assignment:
    PublicBodyPackage["works"][number]["slots"][number]["assignment"] = {
      requirement: "required",
      workMode: "individual",
    };
  const work = {
    id: "sec-work",
    source: "work.qmd",
    kind,
    title: "Работа",
    slots: [{
      id,
      selection,
      candidates: [id],
      assignment,
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
  const pkg: PublicBodyPackage = {
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
        ...required(work.slots[0]),
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
          schemaVersion: 3,
          courseId: "fixture",
          bookRoot: "tasks",
          projects: [],
        },
        nativeInputs: {},
        studentArtifact: async () => ({ files: [], archive: new Uint8Array() }),
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
    return {
      ...value,
      publish: async () => {
        events.push("publish");
        return await actualPublish();
      },
      discard: async () => {
        events.push("discard");
        await actualDiscard();
      },
    };
  };
  const scope = async <T>(use: (v: { harness: string }) => Promise<T>): Promise<T> => {
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
        let prepared: Awaited<ReturnType<typeof f.build>> | undefined;
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
              "publish",
            ]),
          "Неверный порядок " + tail,
        );
        assert((await Deno.stat(f.out)).isDirectory, "Нет output");
        if (course) {
          assert((await Deno.stat(f.privateOut)).isFile, "Нет checks");
        }
        await reject(() => required(prepared).publish(), "already consumed");
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
Deno.test("Course rollback после private link сохраняет конкурентный пустой output и удаляет свои checks", async () => {
  const f = await fixture(true), actual = Deno.link;
  let privateVisible = false;
  try {
    Deno.link = async (from, to) => {
      const result = await actual(from, to);
      if (to === f.privateOut) {
        privateVisible = await Deno.stat(f.privateOut).then(
          (s) => s.isFile,
          () => false,
        );
        await Deno.mkdir(f.out);
      }
      return result;
    };
    await reject(
      () => publishNativePrepared(f.scope, f.build),
      "cannot publish fresh output",
    );
    assert(privateVisible, "Private-first порядок потерян");
    assert((await Deno.stat(f.out)).isDirectory, "Foreign empty directory replaced");
    await Deno.remove(f.out);
    await f.clean();
  } finally {
    Deno.link = actual;
    await Deno.remove(f.root, { recursive: true });
  }
});

for (const course of [false, true]) {
  Deno.test((course ? "course" : "standalone") + ": empty directory created after final lstat survives, retry succeeds", async () => {
    const f = await fixture(course), lstat = Deno.lstat;
    try {
      const prepared = await f.build();
      let injected = false;
      Deno.lstat = async (path) => {
        try { return await lstat(path); } catch (error) {
          if (path === f.out && !injected && error instanceof Deno.errors.NotFound) {
            injected = true;
            await Deno.mkdir(f.out);
          }
          throw error;
        }
      };
      await reject(prepared.publish, "cannot publish fresh output");
      Deno.lstat = lstat;
      assert(injected && (await Deno.lstat(f.out)).isDirectory, "Race not exercised or foreign output overwritten");
      const entries = Array.fromAsync(Deno.readDir(f.out));
      assert((await entries).length === 0, "Foreign output populated");
      await Deno.remove(f.out);
      await f.clean();
      await (await f.build()).publish();
    } finally {
      Deno.lstat = lstat;
      await Deno.remove(f.root, { recursive: true });
    }
  });
}

Deno.test("course: частичная запись checks очищается сразу, сохраняет первичную ошибку и допускает повтор", async () => {
  const f = await fixture(true), write = Deno.writeTextFile, remove = Deno.remove;
  try {
    Deno.writeTextFile = async (path, data, options) => {
      if (String(path).includes(".pl-checks-")) {
        await write(path, "PRIVATE_PARTIAL");
        throw Error("PRIMARY_CHECKS_WRITE_FAILURE");
      }
      return await write(path, data, options);
    };
    await reject(f.build, "PRIMARY_CHECKS_WRITE_FAILURE");
    await f.clean();
    // Secondary cleanup errors must not replace the cause returned to the caller.
    Deno.remove = async (path, options) => {
      if (String(path).includes(".pl-course-")) throw Error("SECONDARY_CLEANUP_FAILURE");
      return await remove(path, options);
    };
    await reject(f.build, "PRIMARY_CHECKS_WRITE_FAILURE");
    Deno.writeTextFile = write;
    Deno.remove = remove;
    const prepared = await f.build();
    await prepared.publish();
    assert((await Deno.stat(f.out)).isDirectory, "Retry failed");
  } finally {
    Deno.writeTextFile = write;
    Deno.remove = remove;
    await Deno.remove(f.root, { recursive: true });
  }
});

Deno.test("course: checks, созданный после последнего lstat, сохраняется", async () => {
  const f = await fixture(true), link = Deno.link;
  try {
    const prepared = await f.build();
    Deno.link = async (from, to) => {
      if (to === f.privateOut) await Deno.writeTextFile(to, "FOREIGN_CHECKS");
      return await link(from, to);
    };
    await reject(prepared.publish, "AlreadyExists");
    assert(await Deno.readTextFile(f.privateOut) === "FOREIGN_CHECKS", "Concurrent checks overwritten");
    await Deno.remove(f.privateOut);
    await f.clean();
    Deno.link = link;
    await (await f.build()).publish();
  } finally {
    Deno.link = link;
    await Deno.remove(f.root, { recursive: true });
  }
});
