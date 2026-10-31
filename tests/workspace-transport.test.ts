import { question } from "../_extensions/course-prairielearn/application/declarations.ts";
import { exportPrairieLearn } from "../_extensions/course-prairielearn/application/export.ts";
import { infoQuestion } from "../_extensions/course-prairielearn/application/native-validators.js";
import { join } from "node:path";
function assert(value: unknown, message: string): asserts value {
  if (!value) throw Error(message);
}
export const workspaceOptions = {
  image: "ghcr.io/example/sp-git-workspace@sha256:" + "a".repeat(64),
  home: "/home/workspace",
  port: 8080,
  gradedFiles: [
    "work/**",
    "work/.git/**",
    "work/.*",
    "explanation.m[d]",
    ".pl-seed/identity.jso[n]",
  ],
};
export const body = {
  schema: "course-body-package-v2",
  owner: "synthetic",
  release: "native",
  apiVersion: [1, 23, 1],
  questions: [{
    owner: "synthetic",
    id: "exr-restore",
    key: "synthetic/exr-restore",
    title: "Восстановление",
    difficulty: "introductory",
    source: "restore.qmd",
    visibility: "public",
    statementVisibility: "open",
    hasPublicSolution: false,
    answerType: "manual",
    condition: [{ t: "Para", c: [{ t: "Str", c: "Сохраните состояния." }] }],
    publicAnswer: [],
  }],
  works: [{
    owner: "synthetic",
    id: "sec-restore",
    key: "synthetic/sec-restore",
    source: "restore.qmd",
    kind: "lab",
    title: "Восстановление",
    slots: [{
      id: "synthetic/sec-restore/exr-restore",
      selection: "fixed",
      candidates: ["synthetic/exr-restore"],
      assignment: { requirement: "required", workMode: "individual" },
    }],
  }],
  resources: [],
};
export async function seed(root: string) {
  const student = join(root, "projects/restore/student"),
    work = join(student, "work");
  await Deno.mkdir(work, { recursive: true });
  await Deno.writeTextFile(join(student, "README.md"), "Публичная заготовка");
  await Deno.writeTextFile(
    join(work, "README.md"),
    "Название: учебный проект.\n",
  );
  await Deno.writeTextFile(
    join(work, "notes.txt"),
    "Следующая встреча: понедельник.\n",
  );
  for (
    const args of [["init", "--initial-branch=main"], ["add", "."], [
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "commit",
      "-m",
      "A",
    ]]
  ) {
    const result = await new Deno.Command("git", {
      args,
      cwd: work,
      stdout: "piped",
      stderr: "piped",
      env: { GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" },
    }).output();
    assert(result.success, "Seed Git failed");
  }
  const files: { name: string; bytes: Uint8Array }[] = [];
  async function collect(dir: string, prefix = "") {
    for await (const entry of Deno.readDir(dir)) {
      const name = prefix + entry.name;
      if (entry.isDirectory) await collect(join(dir, entry.name), name + "/");
      else {files.push({
          name,
          bytes: await Deno.readFile(join(dir, entry.name)),
        });}
    }
  }
  await collect(student);
  const archive = join(root, "seed.zip");
  const result = await new Deno.Command("python3", {
    args: [
      "-c",
      'import pathlib,sys,zipfile; r=pathlib.Path(sys.argv[1]); z=zipfile.ZipFile(sys.argv[2],"w"); [z.write(p,p.relative_to(r)) for p in sorted(r.rglob("*")) if p.is_file()]; z.close()',
      student,
      archive,
    ],
    stdout: "piped",
    stderr: "piped",
  }).output();
  assert(result.success, "Seed ZIP failed");
  return { files, archive: await Deno.readFile(archive) };
}
Deno.test("декларация native Workspace сохраняет Manual и принудительный singleVariant", () => {
  // Возврат старого editor/upload-only decoder должен сломать этот тест.
  const actual = question({
    topic: "Synthetic",
    grading: { method: "manual" },
    submission: { mode: "workspace", workspaceOptions },
  });
  assert(actual.submission.mode === "workspace", "Workspace mode потерян");
  assert(actual.singleVariant === true, "Workspace допускает сброс variant");
});
Deno.test("реальный exporter создаёт native Manual Workspace и локальную загрузку", async () => {
  // Удаление workspace branch или gradedFiles должно потерять native controls/return contract.
  const root = await Deno.makeTempDir({ prefix: "pl-workspace-" });
  try {
    const artifact = await seed(root);
    await exportPrairieLearn(body, {
      projectRoot: root,
      projects: { "exr-restore": "/projects/restore" },
      studentArtifacts: { "exr-restore": artifact },
    }, {
      questions: {
        "exr-restore": {
          topic: "Synthetic",
          grading: { method: "manual" },
          submission: { mode: "workspace", workspaceOptions },
          files: [],
        },
      },
    }, join(root, "out"));
    const base = join(root, "out/questions/synthetic/exr-restore");
    const copied = await Deno.readFile(
      join(base, "workspace/.pl-seed/starter.zip"),
    );
    assert(
      copied.every((b, i) => b === artifact.archive[i]) &&
        copied.length === artifact.archive.length,
      "Workspace seed ZIP bytes изменены",
    );
    const manifest = JSON.parse(
      await Deno.readTextFile(join(base, "workspace/.pl-seed/manifest.json")),
    );
    assert(
      manifest.schema === "pl-git-workspace-seed-v1" &&
        manifest.sha256.length === 64,
      "Нет seed identity",
    );
    const info = JSON.parse(await Deno.readTextFile(join(base, "info.json")));
    const html = await Deno.readTextFile(join(base, "question.html"));
    assert(infoQuestion(info), "Pinned native schema отвергает info.json");
    assert(
      info.gradingMethod === "Manual" && info.singleVariant === true &&
        !info.externalGradingOptions,
      "Workspace получил automatic runtime или смену variant",
    );
    assert(
      info.workspaceOptions.gradedFiles.includes("work/.git/**"),
      "Возврат Git-состояния не объявлен",
    );
    assert(
      html.includes("<pl-workspace>") && html.includes("<pl-file-preview>"),
      "Нет native Workspace/свидетельства сдачи",
    );
    assert(
      html.includes("<pl-file-upload"),
      "Локальная ОС потеряла путь сдачи",
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("Workspace отказывает при смене variant, runtime и небезопасном договоре", async () => {
  const invalid = [
    {
      mode: "workspace",
      workspaceOptions: { ...workspaceOptions, gradedFiles: ["work/**"] },
    },
    {
      mode: "workspace",
      workspaceOptions: {
        ...workspaceOptions,
        image: "example/workspace:latest",
      },
    },
    {
      mode: "workspace",
      workspaceOptions: { ...workspaceOptions, gradedFiles: ["../secret"] },
    },
    {
      mode: "workspace",
      workspaceOptions: { ...workspaceOptions, gradedFiles: [] },
    },
    { mode: "workspace", workspaceOptions: { ...workspaceOptions, port: 80 } },
    {
      mode: "workspace",
      workspaceOptions: { ...workspaceOptions, syncIgnore: ["work/.git"] },
    },
    { mode: "upload", workspaceOptions },
    { mode: "editor", "ace-mode": "ace/mode/java", workspaceOptions },
  ];
  for (const submission of invalid) {
    let rejected = false;
    try {
      question({
        topic: "Synthetic",
        grading: { method: "manual" },
        submission,
      });
    } catch {
      rejected = true;
    }
    assert(rejected, "Неверный договор принят: " + JSON.stringify(submission));
  }
  for (
    const extra of [{ "single-variant": false }, {
      grading: { method: "mixed" },
    }, { grading: "external" }]
  ) {
    let rejected = false;
    try {
      question({
        topic: "Synthetic",
        grading: { method: "manual" },
        submission: { mode: "workspace", workspaceOptions },
        ...extra,
      });
    } catch {
      rejected = true;
    }
    assert(
      rejected,
      "Workspace получил автоматическую оценку либо смену variant",
    );
  }
});

Deno.test("Workspace без materialized seed не публикует ложную готовность", async () => {
  const root = await Deno.makeTempDir({ prefix: "workspace-no-seed-" });
  try {
    await seed(root);
    let rejected = false;
    try {
      await exportPrairieLearn(body, {
        projectRoot: root,
        projects: { "exr-restore": "/projects/restore" },
      }, {
        questions: {
          "exr-restore": {
            topic: "Synthetic",
            grading: { method: "manual" },
            submission: { mode: "workspace", workspaceOptions },
            files: [],
          },
        },
      }, join(root, "out"));
    } catch {
      rejected = true;
    }
    assert(rejected, "Workspace без полного student artifact опубликован");
    let exists = false;
    try {
      await Deno.stat(join(root, "out"));
      exists = true;
    } catch {}
    assert(!exists, "Отклонённый seed оставил delivery");
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
