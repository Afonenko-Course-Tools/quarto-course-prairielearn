import { workspaceSeed } from "../_extensions/course-prairielearn/application/workspace-seed.ts";
// Реальные pinned recipe/Python/Git и C packages; Body/config — explicit harness, не assignment/P.
import { assert, fixture } from "./native-auxiliary-fixtures.ts";
import { nativeWorkspaceArtifact } from "../_extensions/course-prairielearn/application/native-workspace.ts";
import { exportCourse } from "../_extensions/course-prairielearn/application/export-course.ts";
import { exportPrairieLearn } from "../_extensions/course-prairielearn/application/export.ts";
import { captureNativeAuxiliary } from "../_extensions/course-prairielearn/application/native-auxiliary.ts";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
const output = Deno.args[0], download = Deno.args[1], only = Deno.args[2];
const { zip } = await import(
  pathToFileURL(join(download, "_extensions/project-download/public.ts")).href
);
const rows = [];
for (
  const [recipe, mode, label] of [
    ["restore-selected-state", "workspace", "actual-restore-workspace"],
    ["github-ssh", "upload", "actual-github-upload"],
    ["github-ssh", "workspace", "conditional-github-workspace-harness"],
  ]
) {
  if (only && only !== label) continue;
  const f = await fixture(recipe);
  try {
    const id = "exr-seed",
      key = "fixture/" + id,
      settings = mode === "workspace" ? f.options.settings : { mode: "upload" };
    if (mode === "workspace") {
      (settings as any).workspaceOptions.image =
        "ghcr.io/example/sp-git-workspace@sha256:" + "a".repeat(64);
    }
    const auxiliary = captureNativeAuxiliary(f.options.assertCurrent);
    const artifact = await nativeWorkspaceArtifact({
      ...f.options,
      settings,
      zip,
      auxiliary,
    });
    if (mode === "workspace") await workspaceSeed(artifact);
    for (const file of artifact.files) {
      const path = join(f.root, f.options.project, "student", file.name);
      await Deno.mkdir(path.slice(0, path.lastIndexOf("/")), {
        recursive: true,
      });
      await Deno.writeFile(path, file.bytes);
    }
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
        title: "Заготовка",
        source: "bank.qmd",
        visibility: "public",
        statementVisibility: "open",
        hasPublicSolution: false,
        answerType: "manual",
        condition: [{
          t: "Para",
          c: [{ t: "Str", c: "Полное условие. Сохраните историю." }],
        }],
        publicAnswer: [],
      }],
      works: [{
        owner: "fixture",
        id: work.id,
        key: "fixture/sec-work",
        source: work.source,
        kind: work.kind,
        title: work.title,
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
    const courseOut = join(output, label, "course"),
      standalone = join(output, label, "standalone");
    await Deno.mkdir(join(output, label), { recursive: true });
    await exportPrairieLearn(pkg, {
      projectRoot: f.root,
      projects: { [id]: "/" + f.options.project },
      studentArtifacts: { [id]: artifact },
      nativeAuxiliary: auxiliary,
      deferPublish: true,
    }, {
      questions: {
        [id]: {
          topic: "Java",
          grading: { method: "manual" },
          submission: settings,
          files: [],
        },
      },
    }, standalone).then((p) => p!.publish());
    const delivery = await exportCourse({
      courseId: "fixture",
      projectRoot: f.root,
      content: {
        assessments: [work],
        exercises: [{
          id,
          target: "prairielearn",
          extensions: {
            prairielearn: {
              topic: "Java",
              grading: { method: "manual" },
              submission: settings,
            },
          },
        }],
        projects: [{
          exerciseId: id,
          bankMember: true,
          projectRoot: f.options.project,
        }],
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
      output: courseOut,
      checksOutput: join(output, label, "checks.json"),
      body: async () => pkg,
      studentArtifact: async () => artifact,
      nativeAuxiliary: auxiliary,
      deferPublish: true,
    }).then((p) => p.publish());
    assert(
      delivery.schemaVersion === 4 || mode === "upload",
      "Delivery dispatch",
    );
    await Deno.writeFile(
      join(output, label, "actual-seed.zip"),
      artifact.archive,
    );
    rows.push({
      recipe,
      mode,
      label,
      initial: artifact.initial,
      files: artifact.files.map(({ bytes, ...f }: any) => f),
      courseOut,
      standalone,
      deliveryVersion: delivery.schemaVersion,
      limits:
        "Ordinary bounded C producer, actual immutable SP recipe, synthetic Body/config/Workspace image; no genuine assignment/prior P/OCI/release",
    });
  } finally {
    await Deno.remove(f.root, { recursive: true });
  }
}
console.log(JSON.stringify(rows, null, 2));
