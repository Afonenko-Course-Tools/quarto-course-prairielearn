import type { PublicBodyPackage } from "course-core/public.ts";
import type { StudentArtifact } from "./export-types.ts";
import { Buffer } from "node:buffer";
import { withStudentSubmissionNames } from "./student-artifact.ts";
import type {
  CourseExportPlan,
  NativeCompilerInput,
} from "./course-export-plan.ts";
import { dirname, join } from "node:path";
import { applicationJavaTarget, fileSubmission } from "./submission.ts";
import { gradingMethod, question } from "./declarations.ts";
import { safePath } from "./source-selection.ts";
import { uuid } from "./export-identity.ts";
import { nativeAnswerBinding } from "./native-delivery.ts";
type ProjectDelivery = {
  kind: "project" | "workspace";
  uuid: string;
  grading: { method: string };
  submission: ReturnType<typeof question>["submission"];
  sourceRoot: string;
  projectCheck?: string;
  runtime?: string;
  sources?: { projectRelativePath: string; submissionRelativePath: string }[];
  upstreamGradingMethod?: string;
  singleVariant?: boolean;
  seed?: { schema: string; archive: string; manifest: string };
};
type AnswerDelivery = ReturnType<typeof nativeAnswerBinding> & {
  kind: "native-answer";
};
type QuestionBinding = ReturnType<typeof question> & {
  files: string[];
  additionalJavaSources?: NativeCompilerInput["descriptor"]["additionalJavaSources"];
  externalGradingOptions?: {
    image: string;
    timeout: number;
    enableNetworking: boolean;
  };
};
type QuestionTask = {
  plan: CourseExportPlan;
  q: PublicBodyPackage["questions"][number];
  settings: ReturnType<typeof question>;
  scratch: string;
};
function questionSettings(plan: CourseExportPlan, q: QuestionTask["q"]) {
  const { content, d } = plan;
  const e = content.exercises.find((e) => e.id === q.id);
  if (e?.target !== "prairielearn") {
    throw new Error("PL selected member target mismatch");
  }
  return question({
    topic: e.extensions?.prairielearn?.topic ?? d.defaults.topic,
    submission:
      e.extensions?.prairielearn?.submission ??
      d.raw["question-defaults"].submission,
    ...(e.extensions?.prairielearn?.grading !== undefined
      ? { grading: e.extensions.prairielearn.grading }
      : d.raw["question-defaults"].grading
        ? { grading: d.raw["question-defaults"].grading }
        : {}),
    ...(Object.hasOwn(e.extensions?.prairielearn ?? {}, "single-variant")
      ? {
          "single-variant": e.extensions?.prairielearn?.["single-variant"],
        }
      : Object.hasOwn(d.raw["question-defaults"], "single-variant")
        ? {
            "single-variant": d.raw["question-defaults"]["single-variant"],
          }
        : {}),
  });
}
async function manualProjectInput(
  task: QuestionTask,
  studentArtifact: StudentArtifact,
) {
  const {
    plan: { input, content },
    q,
    settings,
    scratch,
  } = task;
  const fact = content.projects?.find(
    (f) => f.exerciseId === q.id && f.bankMember,
  );
  if (!fact || fact.check || !safePath(fact.projectRoot)) {
    throw Error("PL.MANUAL_INVALID: manual требует project без project-check");
  }
  let actual = input.projectRoot;
  for (const part of fact.projectRoot.split("/")) {
    actual = join(actual, part);
    if ((await Deno.lstat(actual)).isSymlink) {
      throw Error("PL manual project symlink forbidden");
    }
  }
  const files = studentArtifact.files.map((f) => ({
    name: f.name,
    data: f.bytes,
  }));
  if (!files.length) throw Error("PL manual student files missing");
  const project = join(scratch, q.id);
  for (const file of files) {
    const path = join(project, "student", file.name);
    await Deno.mkdir(dirname(path), { recursive: true });
    await Deno.writeFile(path, file.data);
  }
  const javaSources = studentArtifact.files.filter(
    (file) => file.reason === "starter" && applicationJavaTarget(file.name),
  );
  const selectedSubmission =
    settings.submission.mode !== "workspace" && javaSources.length
      ? fileSubmission(
          javaSources.map((file) => file.name),
          settings.submission.mode === "editor"
            ? settings.submission.aceMode
            : undefined,
        )
      : settings.submission;
  const binding: QuestionBinding = {
    ...settings,
    submission: selectedSubmission,
    files: javaSources.map((file) => file.name),
  };
  const delivery: ProjectDelivery = {
    kind: "project",
    uuid: await uuid(input.courseId + "/" + q.id),
    grading: { method: "manual" },
    submission: { ...selectedSubmission },
    sourceRoot: fact.projectRoot,
  };
  return { binding, delivery };
}
async function externalProjectInput(task: QuestionTask) {
  const {
    plan: { input },
    q,
    settings,
    scratch,
  } = task;
  const method = gradingMethod(settings.grading).method;
  const fact = input.checks.projects.find(
    (p) => p.exerciseId === q.id && p.bankMember,
  );
  if (!fact?.check || fact.readiness?.ready === false) {
    throw new Error("PL selected_pl_without_check_rejected: " + q.id);
  }
  if (!safePath(fact.projectRoot)) {
    throw new Error("PL unsafe project root");
  }
  let root = input.projectRoot;
  for (const part of fact.projectRoot.split("/")) {
    root = join(root, part);
    if ((await Deno.lstat(root)).isSymlink) {
      throw new Error("PL project symlink forbidden");
    }
  }
  const profile = input.registry.profiles?.[fact.check.runtime];
  const nativeSelection = input.nativeInputs?.[q.id];
  if (!nativeSelection) {
    throw Error("PL.SELECTION_INVALID: selected native bytes required");
  }
  const sources = nativeSelection.sources.map((file) => ({
    name: file.name,
    data: file.bytes,
  }));
  if (
    ![1, 2].includes(input.registry.schemaVersion) ||
    !profile ||
    profile.mode !== fact.check.sourceProfile.mode
  )
    throw new Error("PL runtime profile unavailable");
  const image = profile.image ?? input.candidateImage;
  if (
    !image ||
    !(profile.image
      ? /^.+@sha256:[a-f0-9]{64}$/.test(image)
      : /^sha256:[a-f0-9]{64}$/.test(image))
  ) {
    throw new Error(
      "PL production runtime pin unavailable: " + fact.check.runtime,
    );
  }
  const project = join(scratch, q.id);
  await Deno.mkdir(join(project, "student"), { recursive: true });
  await Deno.mkdir(join(project, "tests"), { recursive: true });
  for (const s of sources) {
    await Deno.mkdir(dirname(join(project, "student", s.name)), {
      recursive: true,
    });
    await Deno.writeFile(join(project, "student", s.name), s.data);
  }
  if (!nativeSelection.tests.length) {
    throw Error("PL trusted tests missing");
  }
  const testNames = new Set<string>();
  for (const file of nativeSelection.tests) {
    if (testNames.has(file.name) || file.name === "grading-job.json") {
      throw Error("PL duplicate or reserved trusted test path");
    }
    testNames.add(file.name);
    const target = join(project, "tests", file.name);
    await Deno.mkdir(dirname(target), { recursive: true });
    await Deno.writeFile(target, file.bytes);
  }
  const c = fact.check,
    descriptor = nativeSelection.descriptor;
  const selectedSubmission = [
    "java25-junit-v1",
    "java25-gradle-junit-v1",
  ].includes(c.runtime)
    ? fileSubmission(
        sources.map((source) => source.name),
        settings.submission.mode === "editor"
          ? settings.submission.aceMode
          : undefined,
      )
    : settings.submission;
  await Deno.writeTextFile(
    join(project, "tests/grading-job.json"),
    JSON.stringify(descriptor, null, 2) + "\n",
  );
  const binding: QuestionBinding = {
    ...settings,
    submission: selectedSubmission,
    files: sources.map((s) => s.name),
    ...(descriptor.additionalJavaSources
      ? { additionalJavaSources: descriptor.additionalJavaSources }
      : {}),
    externalGradingOptions: {
      image,
      timeout: c.limits?.["outer-seconds"] ?? 30,
      enableNetworking: false,
    },
  };
  const key = input.courseId + "/" + q.id;
  const delivery: ProjectDelivery = {
    kind: "project",
    uuid: await uuid(key),
    grading: { method },
    submission: { ...selectedSubmission },
    projectCheck: c.profile,
    runtime: c.runtime,
    sources: fact.sources.map((file) => ({
      projectRelativePath: file.target,
      submissionRelativePath: file.name,
    })),
    sourceRoot: fact.projectRoot,
  };
  return { binding, delivery };
}
export async function courseQuestionInput(
  plan: CourseExportPlan,
  p: PublicBodyPackage,
  scratch: string,
) {
  const { input, content } = plan;
  const binding: { questions: Record<string, QuestionBinding> } = {
    questions: {},
  };
  const projects: Record<string, string> = {},
    studentArtifacts: Record<string, StudentArtifact> = {};
  const questions: Record<string, ProjectDelivery | AnswerDelivery> = {};
  for (const q of p.questions) {
    const settings = questionSettings(plan, q),
      method = gradingMethod(settings.grading).method;
    const answer = input.nativeAnswers?.[q.id],
      key = input.courseId + "/" + q.id;
    if (answer) {
      binding.questions[q.id] = { ...settings, files: [] };
      questions[key] = {
        ...nativeAnswerBinding(
          await uuid(key),
          method,
          answer,
          input.nativeResponseSlots?.[q.id] ?? [],
        ),
        kind: "native-answer",
      };
      continue;
    }
    const fact = content.projects?.find(
      (f) => f.exerciseId === q.id && f.bankMember,
    );
    if (!fact) throw Error("PL student artifact project fact missing");
    const artifact = await input.studentArtifact(fact);
    studentArtifacts[q.id] = withStudentSubmissionNames(
      artifact,
      input.checks.projects
        .find((project) => project.exerciseId === q.id)
        ?.sources.map((file) => ({
          name: file.name,
          target: file.target,
          bytes: new Uint8Array(Buffer.from(file.data, "base64")),
        })) ?? [],
    );
    const task = { plan, q, settings, scratch };
    const projection =
      method === "manual"
        ? await manualProjectInput(task, artifact)
        : await externalProjectInput(task);
    binding.questions[q.id] = projection.binding;
    questions[key] = projection.delivery;
    projects[q.id] = "/" + q.id;
  }
  return { binding, projects, studentArtifacts, questions };
}
export type CourseQuestionDeliveries = Awaited<
  ReturnType<typeof courseQuestionInput>
>["questions"];
