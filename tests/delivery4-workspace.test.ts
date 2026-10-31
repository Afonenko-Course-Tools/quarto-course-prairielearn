import { body, seed, workspaceOptions } from "./workspace-transport.test.ts";
import { exportCourse } from "../_extensions/course-prairielearn/application/export-course.ts";
Deno.test("delivery4 Workspace использует настоящий seed и existing course builder", async () => {
  const root = await Deno.makeTempDir({ prefix: "delivery4-workspace-" });
  try {
    const artifact = await seed(root), id = "exr-restore";
    const policy = {
      attempts: 3,
      pass: { "at-least": 1 },
      assignment: { "student-label": "test" },
      "auto-points": 0,
      "manual-points": 20,
    };
    const config = {
      delivery: {
        book: "tasks",
        course: {
          name: "FIXTURE",
          title: "Проверка",
          timezone: "Europe/Minsk",
          topics: [{
            name: "Synthetic",
            color: "blue2",
            description: "Проверка",
          }],
        },
        instances: {
          test: {
            title: "Проверка",
            "self-enrollment": false,
            publishing: {
              "start-date": "1970-01-01T00:00:00Z",
              "end-date": "9999-12-31T00:00:00Z",
            },
            works: ["sec-restore"],
          },
        },
      },
      "question-defaults": {
        topic: "Synthetic",
        submission: { mode: "upload" },
      },
    };
    const output = Deno.env.get("PL_DELIVERY4_FIXTURES")
      ? Deno.env.get("PL_DELIVERY4_FIXTURES") + "/workspace"
      : root + "/out";
    await exportCourse({
      courseId: "synthetic",
      projectRoot: root,
      content: {
        assessments: [{
          id: "sec-restore",
          source: "restore.qmd",
          kind: "lab",
          title: "Работа",
          slots: [{
            id,
            selection: "fixed",
            candidates: [id],
            assignment: { requirement: "required", workMode: "individual" },
          }],
          extensions: { prairielearn: policy },
        }],
        exercises: [{
          id,
          target: "prairielearn",
          extensions: {
            prairielearn: {
              topic: "Synthetic",
              grading: { method: "manual" },
              submission: { mode: "workspace", workspaceOptions },
            },
          },
        }],
        projects: [{
          exerciseId: id,
          bankMember: true,
          projectRoot: "projects/restore",
        }],
      },
      checks: {
        schemaVersion: 1,
        courseId: "synthetic",
        bookRoot: "tasks",
        sourceSnapshotHash: "a".repeat(64),
        inventoryHash: "b".repeat(64),
        projects: [],
      },
      registry: { schemaVersion: 1, profiles: {} },
      config,
      instance: "test",
      output,
      checksOutput: root + "/checks.json",
      body: async () => body,
      studentArtifact: async () => artifact,
    });
    const d = JSON.parse(await Deno.readTextFile(output + "/delivery.json"));
    if (
      d.schemaVersion !== 4 ||
      d.gradingPayloads["synthetic/" + id].kind !== "workspace"
    ) throw Error("Workspace binding потерян");
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
