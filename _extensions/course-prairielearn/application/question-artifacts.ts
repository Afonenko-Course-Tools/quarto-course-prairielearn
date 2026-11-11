import { isDeepStrictEqual } from "node:util";
import type { NativeAuxiliary } from "./native-auxiliary.ts";
import type { PublicBodyPackage } from "course-core/public.ts";
import type { DiagnosticContext } from "./diagnostics.ts";
import { join, resolve } from "node:path";
import { fail, fields, files, record, safe } from "./export-files.ts";
import { uuid } from "./export-identity.ts";
import { renderPublicBody } from "./public-body-render.ts";
import { renderNativeAnswer } from "./native-answer.ts";
import { workspaceSeed } from "./workspace-seed.ts";
import { fileSubmission, submission as parseSubmission } from "./submission.ts";
import { publicationConditionFile } from "./publication-conditions.ts";
import { validateAdditionalJavaSources } from "./runtime-descriptor.ts";
import { gradingMethod } from "./declarations.ts";
import type { SelectedExportPlan } from "./selected-export-plan.ts";
function metadata(
  q: Pick<PublicBodyPackage["questions"][number], "difficulty" | "time">,
): string {
  const difficulty: Record<string, string> = {
    introductory: "Начальный",
    intermediate: "Средний",
    advanced: "Высокий",
  };
  const parts = [
    q.difficulty ? "Сложность: " + difficulty[q.difficulty] : "",
    q.time !== undefined ? "Время: " + q.time + " мин" : "",
  ].filter(Boolean);
  return parts.length
    ? '<p class="course-question-metadata">' + parts.join(" · ") + "</p>\n"
    : "";
}
type ArtifactFile = { name: string; data: Uint8Array };
/** Per-course, data-only reuse. No borrowed Core method or lease is retained in
 * the snapshot; an entry is usable only with the identical auxiliary owner. */
export class QuestionArtifactReuse {
  private readonly entries = new Map<
    string,
    {
      snapshot: unknown;
      files: ArtifactFile[];
      auxiliary: NativeAuxiliary | undefined;
    }
  >();
  async find(key: string, snapshot: unknown, auxiliary?: NativeAuxiliary) {
    const previous = this.entries.get(key);
    if (
      !previous || previous.auxiliary !== auxiliary ||
      !isDeepStrictEqual(previous.snapshot, snapshot)
    ) return undefined;
    await auxiliary?.before();
    await auxiliary?.after();
    return structuredClone(previous.files);
  }
  remember(
    key: string,
    snapshot: unknown,
    files: ArtifactFile[],
    auxiliary?: NativeAuxiliary,
  ) {
    this.entries.set(key, {
      snapshot: structuredClone(snapshot),
      files: structuredClone(files),
      auxiliary,
    });
  }
}
type QuestionTask =
  & SelectedExportPlan["questions"][number]
  & Pick<SelectedExportPlan, "p" | "context" | "root">;
type QuestionFile = { name: string; data: Uint8Array };
const questionFailure =
  (task: QuestionTask) =>
  (message: string, field: string, cause?: unknown): never =>
    fail(message, { ...task.diagnostic, field }, cause);
const encode = (name: string, data: string): QuestionFile => ({
  name,
  data: new TextEncoder().encode(data),
});
async function answerArtifacts(
  task: QuestionTask,
  answer: NonNullable<SelectedExportPlan["context"]["nativeAnswers"]>[string],
) {
  const { p, context, question: q, binding: b, diagnostic: questionContext } =
    task;
  const questionFail = questionFailure(task), prepared: QuestionFile[] = [];
  const text = (name: string, data: string) =>
    prepared.push(encode(name, data));
  if (
    answer.type !== q.answerType ||
    !fields(b, ["topic", "files"], [
      "grading",
      "submission",
      "singleVariant",
    ]) || typeof b.topic !== "string" || !b.topic.trim() ||
    !Array.isArray(b.files) || b.files.length
  ) {
    questionFail(
      "Форма ответа требует canonical Core answer без файлов и runtime",
      "answer",
    );
  }
  const manualAnswer = answer.type === "manual" ||
    answer.type === "multipart" &&
      answer.parts.every((part: { type: string }) => part.type === "manual");
  const method = gradingMethod(b.grading).method;
  if (manualAnswer !== (method === "manual")) {
    questionFail(
      "Метод оценивания не соответствует форме ответа",
      "answer",
    );
  }
  const rendered = await renderPublicBody(
    p,
    q.condition,
    q.key,
    questionContext,
    "questions/" + q.key + "/clientFilesQuestion",
    "{{options.client_files_question_url}}",
    {
      preserveBibliography: context.nativeBody,
      auxiliary: context.nativeAuxiliary,
    },
  );
  prepared.push(...rendered.files);
  const native = renderNativeAnswer(answer), base = "questions/" + q.key;
  text(base + "/server.py", native.server);
  text(
    base + "/question.html",
    "<pl-question-panel>\n" + metadata(q) + rendered.html + "\n" +
      native.controls + "\n</pl-question-panel>\n",
  );
  text(
    base + "/info.json",
    JSON.stringify(
      {
        uuid: await uuid(q.key),
        type: "v3",
        title: q.title,
        topic: b.topic,
        gradingMethod: manualAnswer ? "Manual" : "Internal",
        showCorrectAnswer: false,
        partialCredit: !manualAnswer,
        ...(b.singleVariant !== undefined
          ? { singleVariant: b.singleVariant }
          : {}),
      },
      null,
      2,
    ) + "\n",
  );
  return prepared;
}
function validateExternalGrading(task: QuestionTask, manual: boolean) {
  const { question: q, binding: b } = task;
  const questionFail = questionFailure(task);
  const grading = b.externalGradingOptions;
  if (
    !manual && (
      !fields(grading, ["image"], [
        "entrypoint",
        "timeout",
        "enableNetworking",
        "environment",
      ]) || typeof grading.image !== "string" || !grading.image.trim() ||
      grading.timeout !== undefined &&
        (typeof grading.timeout !== "number" ||
          !Number.isInteger(grading.timeout) || grading.timeout < 1 ||
          grading.timeout > 600) ||
      grading.enableNetworking !== undefined &&
        typeof grading.enableNetworking !== "boolean" ||
      grading.entrypoint !== undefined &&
        !(typeof grading.entrypoint === "string" ||
          Array.isArray(grading.entrypoint) && grading.entrypoint.length &&
            grading.entrypoint.every((x: unknown) => typeof x === "string")) ||
      grading.environment !== undefined &&
        (!record(grading.environment) ||
          Object.values(grading.environment).some((x) => typeof x !== "string"))
    )
  ) {
    questionFail(
      "Неверная привязка внешнего проверяющего инструмента",
      "binding.questions." + q.id + ".externalGradingOptions",
    );
  }
  return grading;
}
function projectPolicy(task: QuestionTask) {
  const { question: q, binding: b } = task;
  const questionFail = questionFailure(task);
  if (q.answerType !== "manual") {
    questionFail("Нет проверенного canonical Core answer", "answer");
  }
  const manual = gradingMethod(b?.grading).method === "manual";
  if (
    !fields(b, [
      "topic",
      "files",
      ...(manual ? [] : ["externalGradingOptions"]),
    ], [
      "submission",
      "singleVariant",
      "additionalJavaSources",
      "grading",
    ]) ||
    b.singleVariant !== undefined && typeof b.singleVariant !== "boolean" ||
    typeof b.topic !== "string" || !b.topic.trim() ||
    !Array.isArray(b.files) ||
    !b.files.every((name: unknown) => typeof name === "string") ||
    !manual && !b.files.length ||
    new Set(b.files).size !== b.files.length ||
    b.files.some((f: unknown) => !safe(f) || /[",<>]/.test(String(f)))
  ) {
    return questionFail(
      "Требуются topic, принимаемые файлы и внешний проверяющий инструмент",
      "binding.questions." + q.id,
    );
  }
  let submission: ReturnType<typeof parseSubmission> = { mode: "upload" };
  try {
    submission = parseSubmission(b.submission ?? { mode: "upload" });
  } catch (cause) {
    questionFail("Неверный договор submission", "submission", cause);
  }
  const workspace = submission.mode === "workspace"
    ? submission.workspaceOptions
    : undefined;
  if (
    manual &&
    (b.additionalJavaSources !== undefined ||
      b.externalGradingOptions !== undefined ||
      submission.mode === "editor" &&
        (!b.files.length ||
          b.files.some((name: string) => !name.endsWith(".java"))))
  ) {
    questionFail(
      "Manual требует настоящие Java starter-файлы для editor и не допускает автоматический runtime",
      "submission",
    );
  }
  if (workspace && (!manual || b.singleVariant === false)) {
    questionFail(
      "Workspace требует Manual и singleVariant: true",
      "submission",
    );
  }
  const grading = validateExternalGrading(task, manual);
  return {
    b: {
      files: b.files,
      topic: b.topic,
      additionalJavaSources: b.additionalJavaSources,
      singleVariant: b.singleVariant,
    },
    manual,
    submission,
    workspace,
    grading,
  };
}
type ProjectPolicy = ReturnType<typeof projectPolicy>;
async function readProject(task: QuestionTask, manual: boolean) {
  const { question: q, root, context, diagnostic: questionContext } = task;
  const questionFail = questionFailure(task);
  const project = context.projects[q.id];
  if (
    typeof project !== "string" || !project.startsWith("/") ||
    !safe(project.slice(1))
  ) {
    return questionFail(
      "Требуется путь проекта от корня выбранного проекта",
      "project",
    );
  }
  const source = resolve(root, project.slice(1));
  let walk = root;
  for (const part of project.slice(1).split("/")) {
    walk = join(walk, part);
    if ((await Deno.lstat(walk)).isSymlink) {
      questionFail(
        "Символьная ссылка в пути проекта",
        "project",
      );
    }
  }
  if ((await Deno.realPath(source)) !== source) {
    questionFail(
      "Проект выходит за пределы выбранного проекта",
      "project",
    );
  }
  const student = await files(join(source, "student"), {
      ...questionContext,
      field: "project.student",
    }, true),
    tests = manual ? [] : await files(join(source, "tests"), {
      ...questionContext,
      field: "project.tests",
    });
  if (!student.length || !manual && !tests.length) {
    questionFail(
      "Требуются стартовые файлы student и проверяющие файлы tests",
      "project",
    );
  }
  return { student, tests };
}
type ProjectFiles = Awaited<ReturnType<typeof readProject>>;
async function starterArtifacts(
  task: QuestionTask,
  policy: ProjectPolicy,
  project: ProjectFiles,
) {
  const { question: q, context } = task;
  const { submission } = policy, { student, tests } = project;
  const questionFail = questionFailure(task), prepared: QuestionFile[] = [];
  const base = "questions/" + q.key;
  const artifact = context.studentArtifacts?.[q.id];
  if (artifact) {
    if (
      !Array.isArray(artifact.files) || !artifact.files.length ||
      !(artifact.archive instanceof Uint8Array) || !artifact.archive.length
    ) questionFail("Пустой комплект Core/Download", "studentArtifact");
    for (const file of artifact.files) {
      if (
        !safe(file.name) ||
        !file.name.split("/").includes(".git") &&
          file.name.split("/").some((part) =>
            [
              "private",
              "reference",
              "solution",
              "solutions",
              "grading-notes",
              "rubric.md",
              "contract.md",
            ].includes(part)
          )
      ) {
        questionFail(
          "Закрытый или небезопасный файл в student artifact",
          "studentArtifact",
        );
      }
      if (!file.name.split("/").includes(".git")) {
        prepared.push({
          name: base + "/clientFilesQuestion/starter/" + file.name,
          data: file.bytes,
        });
      }
    }
    prepared.push({
      name: base + "/clientFilesQuestion/starter.zip",
      data: artifact.archive,
    });
  }
  if (submission.mode === "workspace") {
    let seed: Awaited<ReturnType<typeof workspaceSeed>>;
    try {
      seed = await workspaceSeed(artifact);
    } catch (cause) {
      return questionFail(
        "Неполный seed либо договор возврата Workspace",
        "studentArtifact",
        cause,
      );
    }
    for (const file of seed) {
      prepared.push({
        name: base + "/workspace/" + file.name,
        data: file.data,
      });
    }
  }
  for (const f of submission.mode === "editor" || artifact ? [] : student) {
    prepared.push({
      name: base + "/clientFilesQuestion/" + f.name,
      data: f.data,
    });
  }
  for (const f of tests) {
    prepared.push({ name: base + "/tests/" + f.name, data: f.data });
  }
  return prepared;
}
function javaSubmission(
  task: QuestionTask,
  policy: ProjectPolicy,
  project: ProjectFiles,
  prepared: QuestionFile[],
) {
  const { question: q } = task,
    { b, workspace, manual } = policy,
    { student, tests } = project;
  const base = "questions/" + q.key, questionFail = questionFailure(task);
  let submission = policy.submission;
  const extras = b.additionalJavaSources === undefined
    ? undefined
    : validateAdditionalJavaSources(
      b.additionalJavaSources,
      b.files,
      tests.map((f) => f.name),
    );
  if (
    !workspace && b.files.length &&
    b.files.every((name: string) => name.endsWith(".java")) &&
    (extras || manual)
  ) {
    submission = fileSubmission(
      b.files,
      submission.mode === "editor" ? submission.aceMode : undefined,
    );
  }
  if (
    manual && b.files.length &&
    b.files.every((name: string) => name.endsWith(".java"))
  ) {
    for (const name of b.files) {
      const starter = student.find((file) => file.name === name);
      if (!starter) {
        return questionFail(
          "Нет настоящего starter для Manual Java",
          "project.student." + name,
        );
      }
      prepared.push({
        name: base + "/serverFilesQuestion/starter/" + name,
        data: starter.data,
      });
    }
  }
  return { submission, extras };
}
function escape(v: string) {
  return v.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll(
    "<",
    "&lt;",
  ).replaceAll(">", "&gt;").replaceAll("{{", "&#123;&#123;").replaceAll(
    "}}",
    "&#125;&#125;",
  );
}
function editorControls(
  task: QuestionTask,
  policy: ProjectPolicy,
  student: ProjectFiles["student"],
) {
  const { b, submission } = policy, questionFail = questionFailure(task);
  if (submission.mode !== "editor") throw Error("PL editor plan required");
  const aceMode = submission.aceMode;
  return b.files.map((name: string) => {
    const starter = student.find((file) => file.name === name);
    if (!starter || starter.data.length > 1024 * 1024) {
      return questionFail(
        "Требуется UTF-8 starter для каждого editor файла",
        "project.student." + name,
      );
    }
    let source = "";
    try {
      source = new TextDecoder("utf-8", { fatal: true }).decode(
        starter.data,
      );
      if (source.includes("\0")) throw new Error("NUL in source");
    } catch (cause) {
      questionFail(
        "Editor starter должен быть текстом UTF-8",
        "project.student." + name,
        cause,
      );
    }
    const code = escape(source).replaceAll("{{", "&#123;&#123;")
      .replaceAll("}}", "&#125;&#125;");
    return '<pl-file-editor file-name="' + escape(name) + '"' +
      (aceMode ? ' ace-mode="' + escape(aceMode) + '"' : "") +
      ' normalize-to-ascii="false">' + code + "</pl-file-editor>";
  }).join("\n");
}
function uploadControls(
  task: QuestionTask,
  policy: ProjectPolicy,
  student: ProjectFiles["student"],
  extras: ReturnType<typeof validateAdditionalJavaSources> | undefined,
) {
  const { b, submission, manual } = policy,
    questionFail = questionFailure(task);

  const downloads = task.context.studentArtifacts?.[task.question.id] ? "" : student.map((f) =>
    '<pl-file-download file-name="' + escape(f.name) +
    '"></pl-file-download>'
  ).join("\n");
  const layout = submission.mode === "upload" ? submission.layout : undefined;
  const zip = layout === "zip" || layout === undefined &&
      b.files.length >= 3 && b.files.some((name: string) => name.includes("/"));
  if (zip && !manual && !extras) {
    questionFail(
      "Для вложенного ответа требуется явный ZIP transport в additional-java-sources",
      "submission",
    );
  }
  return downloads +
    (zip
      ? '\n<pl-file-upload file-names="' +
        escape(extras?.archive ?? "solution.zip") + '"></pl-file-upload>'
      : layout === "files"
      ? '\n<pl-file-upload file-names="' + escape(b.files.join(",")) +
        '"></pl-file-upload>'
      : manual
      ? '\n<pl-file-upload file-patterns="*" optional-file-patterns="*"></pl-file-upload>'
      : '\n<pl-file-upload file-names="' + escape(b.files.join(",")) +
        '"></pl-file-upload>');
}
function submissionControls(
  task: QuestionTask,
  policy: ProjectPolicy,
  student: ProjectFiles["student"],
  extras: ReturnType<typeof validateAdditionalJavaSources> | undefined,
) {
  const { question: q, context } = task, { workspace, submission } = policy;
  const artifact = context.studentArtifacts?.[q.id];
  let controls: string;
  if (workspace) {
    controls =
      '<pl-workspace></pl-workspace>\n<p>При работе в собственной ОС загрузите архив решения.</p>\n<pl-file-upload optional-file-patterns="*.zip,*.tar.gz"></pl-file-upload>';
  } else if (submission.mode === "editor") {
    controls = editorControls(task, policy, student);
  } else {
    controls = uploadControls(task, policy, student, extras);
  }
  if (submission.mode === "upload" && submission.layout === "zip") {
    controls =
      "<p>Загрузите один ZIP со всеми исходниками, сохранив перечисленные относительные пути внутри архива.</p>\n" +
      controls;
  }
  if (artifact) {
    controls =
      '<p><a href="{{options.client_files_question_url}}/starter.zip">Скачать заготовку</a>' +
      (artifact.files.some((f) => f.name === "README.md")
        ? ' · <a href="{{options.client_files_question_url}}/starter/README.md">README</a>'
        : "") +
      "</p>\n" + controls;
  }
  return controls;
}
async function projectArtifacts(
  task: QuestionTask,
  identity: unknown,
  reuse?: QuestionArtifactReuse,
) {
  const { question: q, p, context, diagnostic: questionContext } = task;
  const policy = projectPolicy(task),
    project = await readProject(task, policy.manual);
  const artifact = context.studentArtifacts?.[q.id];
  const projectIdentity = {
    identity,
    ...project,
    artifact,
    submission: policy.submission,
  };
  const cached = await reuse?.find(
    q.key,
    projectIdentity,
    context.nativeAuxiliary,
  );
  if (cached) return cached;
  const prepared = await starterArtifacts(task, policy, project);
  const { submission, extras } = javaSubmission(
    task,
    policy,
    project,
    prepared,
  );
  const { b, manual, workspace, grading } = policy, base = "questions/" + q.key;
  let controls = submissionControls(
    task,
    { ...policy, submission },
    project.student,
    extras,
  );
  const rendered = await renderPublicBody(
    p,
    q.condition,
    q.key,
    questionContext,
    base + "/clientFilesQuestion",
    "{{options.client_files_question_url}}",
    {
      preserveBibliography: context.nativeBody,
      auxiliary: context.nativeAuxiliary,
    },
  );
  prepared.push(...rendered.files);
  const html = rendered.html;
  const text = (name: string, data: string) =>
    prepared.push(encode(name, data));
  const presented = publicationConditionFile(
    q.id,
    context.publicationConditions?.[q.id],
  );
  if (presented) {
    prepared.push({
      name: base + "/clientFilesQuestion/" + presented.file.name,
      data: presented.file.data,
    });
    controls = presented.html + "\n" + controls;
  }
  text(
    base + "/question.html",
    "<pl-question-panel>\n" + metadata(q) + html + "\n" + controls +
      "\n</pl-question-panel>\n" +
      (workspace
        ? "<pl-submission-panel><pl-file-preview></pl-file-preview></pl-submission-panel>\n"
        : manual
        ? ""
        : "<pl-submission-panel><pl-external-grader-results></pl-external-grader-results></pl-submission-panel>\n"),
  );
  text(
    base + "/info.json",
    JSON.stringify(
      {
        uuid: await uuid(q.key),
        type: "v3",
        title: q.title,
        topic: b.topic,
        gradingMethod: manual ? "Manual" : "External",
        ...(b.singleVariant !== undefined
          ? { singleVariant: b.singleVariant }
          : {}),
        ...(workspace
          ? { singleVariant: true, workspaceOptions: workspace }
          : {}),
        showCorrectAnswer: false,
        partialCredit: false,
        ...(manual ? {} : { externalGradingOptions: grading }),
      },
      null,
      2,
    ) + "\n",
  );
  reuse?.remember(q.key, projectIdentity, prepared, context.nativeAuxiliary);
  return prepared;
}
export async function questionArtifacts(plan: SelectedExportPlan, options?: {
  reuse: QuestionArtifactReuse;
  identities: Readonly<Record<string, unknown>>;
}) {
  const { p, context, root } = plan;
  const prepared: QuestionFile[] = [], keys: string[] = [];
  for (const selected of plan.questions) {
    const task = { ...selected, p, context, root }, q = selected.question;
    const identity = {
      owner: p.owner,
      release: p.release,
      apiVersion: p.apiVersion,
      resources: p.resources,
      question: q,
      binding: selected.binding,
      nativeIdentity: options?.identities[q.key],
      nativeBody: context.nativeBody,
      answer: context.nativeAnswers?.[q.id],
      publicationCondition: context.publicationConditions?.[q.id],
    };
    const answer = context.nativeAnswers?.[q.id];
    if (answer) {
      const cached = await options?.reuse.find(
        q.key,
        identity,
        context.nativeAuxiliary,
      );
      const files = cached ?? await answerArtifacts(task, answer);
      if (!cached) {
        options?.reuse.remember(
          q.key,
          identity,
          files,
          context.nativeAuxiliary,
        );
      }
      prepared.push(...files);
    } else {prepared.push(
        ...await projectArtifacts(task, identity, options?.reuse),
      );}
    keys.push(q.key);
  }
  if (new Set(prepared.map((file) => file.name)).size !== prepared.length) {
    fail("Файлы поставки имеют совпадающие пути", {
      ...plan.workContext,
      field: "output",
    });
  }
  return { files: prepared, keys };
}
