import { applicationJavaTarget, fileSubmission } from "./submission.ts";
import type {
  BodyResource,
  PublicBodyPackage,
} from "course-core/body-export/model.ts";
import type { NativeAuxiliary } from "./native-auxiliary.ts";
import { nativeAnswerBinding } from "./native-delivery.ts";
import { createMetrics as __createMetrics } from "../observability/bridge.ts";
const __metrics = __createMetrics("course-prairielearn");
import { nativeSlotZones, qualifiedSlots } from "./slots.ts";
import { dirname, join, relative, resolve } from "node:path";
import { gradingPolicy, validateGradingComponents } from "./grading-policy.ts";
import { completionPolicy } from "./completion.ts";
import * as validators from "./native-validators.js";
import { validateAssessmentSemantics } from "./native-semantics.ts";
import {
  exportPrairieLearn,
  publicProjectFiles,
  renderPublicBody,
  uuid,
} from "./export.ts";
import { declarations, gradingMethod, question } from "./declarations.ts";
import type { CheckedNativeProjectFact } from "./native-check-projection.ts";
import type { materializeNativeQuestion } from "./native-materialize.ts";
import type { StudentArtifact } from "./export.ts";
import type {
  AnswerFacts,
  NativeAdapterValidationInput,
  NativeProjectFact,
  NativeResponseSlot,
} from "course-core/public.ts";
import type { RuntimeProfile } from "./runtime-descriptor.ts";
import type { AssessmentPolicySchema } from "./native-business.ts";
import type { NativeCourseChecks } from "./native-check-inventory.ts";
import { isDeepStrictEqual } from "node:util";
import { canonical, safePath } from "./source-selection.ts";
/** Один matcher для раннего native context и окончательной сборки. */
type MenuWork = Pick<
  NonNullable<NativeAdapterValidationInput["assessment"]>,
  "id" | "slots"
>;
export function nativeUnitMenus<T extends MenuWork>(
  works: readonly MenuWork[],
  assessments: readonly T[],
): Map<string, T[]> {
  const unitMenus = new Map<string, T[]>();
  for (const work of works) {
    if (!work.id.startsWith("sec-unit-")) continue;
    const expected = "exr-" + work.id.slice("sec-unit-".length);
    const slot = work.slots?.[0];
    if (
      work.slots?.length !== 1 || slot?.selection !== "fixed" ||
      slot.id !== expected || slot.candidates?.length !== 1 ||
      slot.candidates[0] !== expected ||
      slot.assignment?.requirement !== "required"
    ) {
      throw Error(
        "PL reference-only unit не соответствует единственной задаче: " +
          work.id,
      );
    }
    const menus = assessments.filter((menu) =>
      menu.id !== work.id &&
      menu.slots.some((member) =>
        member.assignment.requirement === "optional" &&
        member.candidates.includes(expected)
      )
    );
    if (new Set(menus.map((menu) => menu.id)).size !== menus.length) {
      throw Error("PL неоднозначный источник контекста меню: " + work.id);
    }
    unitMenus.set(work.id, menus);
  }
  return unitMenus;
}
export async function identity(
  name: string,
  namespace = "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
) {
  const ns = Uint8Array.from(
    namespace.replaceAll("-", "").match(/../g)!,
    (x) => parseInt(x, 16),
  );
  const bytes = new Uint8Array([...ns, ...new TextEncoder().encode(name)]);
  const h = new Uint8Array(await crypto.subtle.digest("SHA-1", bytes)).slice(
    0,
    16,
  );
  h[6] = (h[6] & 15) | 80;
  h[8] = (h[8] & 63) | 128;
  const hex = [...h].map((x) => x.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}
async function absent(path: string) {
  try {
    await Deno.lstat(path);
    throw new Error("PL fresh output required: " + path);
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
  }
}
async function inventoryNames(root: string) {
  const files: string[] = [];
  async function walk(dir: string) {
    for (
      const e of [...await Array.fromAsync(Deno.readDir(dir))].sort((a, b) =>
        a.name.localeCompare(b.name)
      )
    ) {
      const path = join(dir, e.name);
      if (e.isDirectory) await walk(path);
      else if (e.isFile) {
        files.push(relative(root, path).replaceAll("\\", "/"));
      } else throw new Error("PL unexpected artifact");
    }
  }
  await walk(root);
  return files.sort();
}
async function sameQuestionFiles(
  left: string,
  right: string,
  rightNames: string[],
) {
  if (!isDeepStrictEqual(await inventoryNames(left), rightNames)) return false;
  // При коллизии проверяем все реальные готовые файлы обоих вопросов.
  for (const name of rightNames) {
    if (
      !isDeepStrictEqual(
        await Deno.readFile(join(left, name)),
        await Deno.readFile(join(right, name)),
      )
    ) return false;
  }
  return true;
}
type ExportAssessment =
  & Pick<
    NonNullable<NativeAdapterValidationInput["assessment"]>,
    "id" | "title" | "kind" | "slots" | "relatedExercise"
  >
  & {
    source: string;
    extensions: {
      prairielearn: ReturnType<typeof AssessmentPolicySchema.parse>;
    };
  };
type ExportExercise =
  & Pick<NativeAdapterValidationInput["declarations"][number], "id">
  & {
    target: string;
    // Авторские значения повторно проверяет существующий question() reader.
    extensions?: {
      prairielearn?: Partial<
        Record<"topic" | "submission" | "grading" | "single-variant", unknown>
      >;
    };
  };
export interface ExportCourseContent {
  assessments: ExportAssessment[];
  exercises: ExportExercise[];
  projects?: Pick<
    CheckedNativeProjectFact,
    "exerciseId" | "bankMember" | "projectRoot" | "check"
  >[];
}
type NativeSelection = NonNullable<
  Awaited<ReturnType<typeof materializeNativeQuestion>>["selection"]
>;
/** Writer читает только имена/bytes и уже подготовленный runtime descriptor. */
export type NativeCompilerInput = Pick<NativeSelection, "descriptor"> & {
  sources: readonly Pick<
    NativeSelection["sources"][number],
    "name" | "bytes"
  >[];
  tests: readonly Pick<NativeSelection["tests"][number], "name" | "bytes">[];
};

export async function exportCourse(
  input: {
    courseId: string;
    projectRoot: string;
    content: ExportCourseContent;
    checks: NativeCourseChecks;
    config: unknown;
    registry: {
      schemaVersion: number;
      profiles?: Record<
        string,
        Pick<RuntimeProfile, "mode"> & Partial<RuntimeProfile> & {
          image?: string;
        }
      >;
    };
    instance: string;
    output: string;
    checksOutput: string;
    body: (work: string) => Promise<PublicBodyPackage>;
    candidateImage?: string;
    deferPublish?: boolean;
    nativeBody?: boolean;
    nativeAuxiliary?: NativeAuxiliary;
    nativeInputs: Record<string, NativeCompilerInput>;
    nativeAnswers?: Record<string, AnswerFacts>;
    nativeResponseSlots?: Record<string, NativeResponseSlot[]>;
    studentArtifact: (
      fact: Pick<NativeProjectFact, "exerciseId">,
    ) => Promise<StudentArtifact>;
  },
) {
  const content = input.content;
  if (
    !content || !Array.isArray(content.assessments) ||
    !Array.isArray(content.exercises)
  ) {
    throw Error("PL.INPUT_INVALID: course content required");
  }
  const d = declarations(input.config, input.instance),
    out = resolve(input.output),
    privateOut = resolve(input.checksOutput);
  if (privateOut === out || privateOut.startsWith(out + "/")) {
    throw new Error("PL private checks output inside native delivery");
  }
  await absent(out);
  await absent(privateOut);
  const works = d.instance.works.map((id: string) => {
    const work = content.assessments.find((w) => w.id === id);
    if (!work) throw new Error("PL selected work missing: " + id);
    if (!work.extensions.prairielearn) {
      throw new Error("PL selected work requires policy");
    }
    return work;
  });
  const menuBodies = new Map<string, PublicBodyPackage>();
  const unitMenus = nativeUnitMenus(works, content.assessments);
  const active = new Set();
  for (const w of works) {
    if (w.relatedExercise) {
      if (active.has(w.relatedExercise)) {
        throw new Error("PL duplicate active defense");
      }
      active.add(w.relatedExercise);
    }
  }
  const methods: Record<string, "external" | "manual" | "mixed"> = {};
  for (const exercise of content.exercises) {
    methods[exercise.id] = gradingMethod(
      exercise.extensions?.prairielearn?.grading ??
        d.raw["question-defaults"].grading,
    ).method;
  }
  for (const work of works) validateGradingComponents(work, methods);
  const courseUuid = await identity("course/" + input.courseId);
  const assessmentUuids = new Map<string, string>();
  const uuidOwners = new Map<string, string>();
  for (const work of works) {
    const uuid = work.extensions.prairielearn.uuid ??
      await identity("assessment/" + work.id, courseUuid);
    const previous = uuidOwners.get(uuid.toLowerCase());
    if (previous !== undefined) {
      throw Error(
        `PL.ASSESSMENT_INVALID: повторный UUID ${uuid}: ${previous} и ${work.id}`,
      );
    }
    uuidOwners.set(uuid.toLowerCase(), work.id);
    assessmentUuids.set(work.id, uuid);
  }
  const stage = await Deno.makeTempDir({
      dir: dirname(out),
      prefix: ".pl-course-",
    }),
    scratch = await Deno.makeTempDir({
      dir: dirname(out),
      prefix: ".pl-selected-",
    });
  const write = async (path: string, v: any) => {
    await Deno.mkdir(dirname(join(stage, path)), { recursive: true });
    const schema = path.endsWith("/info.json")
      ? "infoQuestion"
      : path.split("/").at(-1)?.replace(".json", "");
    const validate = (validators as any)[schema!];
    if (validate && !validate(v)) {
      throw new Error(
        "PL upstream schema " + path + ": " + JSON.stringify(validate.errors),
      );
    }
    if (schema === "infoAssessment") validateAssessmentSemantics(v, path);
    await Deno.writeTextFile(
      join(stage, path),
      JSON.stringify(v, null, 2) + "\n",
    );
  };
  try {
    await write("infoCourse.json", {
      uuid: courseUuid,
      name: d.course.name,
      title: d.course.title,
      timezone: d.course.timezone,
      topics: d.course.topics,
    });
    await write(
      "courseInstances/" + input.instance + "/infoCourseInstance.json",
      {
        uuid: await identity("instance/" + input.instance, courseUuid),
        longName: d.instance.title,
        studentLabels: await Promise.all(
          [
            ...new Set(
              works.filter((w) => w.relatedExercise).map((w) =>
                ((assignment) =>
                  assignment && "student-label" in assignment
                    ? assignment["student-label"]
                    : undefined)(w.extensions.prairielearn.assignment)
              ),
            ),
          ].map(async (name) => {
            if (typeof name !== "string" || !name) {
              throw new Error("PL resolved assignment label required");
            }
            return {
              name,
              color: "blue2",
              uuid: await identity(
                "student-label/" + input.instance + "/" + name,
                courseUuid,
              ),
            };
          }),
        ),
        timezone: d.course.timezone,
        selfEnrollment: { enabled: d.instance["self-enrollment"] },
        publishing: {
          startDate: d.instance.publishing["start-date"],
          endDate: d.instance.publishing["end-date"],
        },
      },
    );
    const questions: Record<string, any> = {};
    const questionSnapshots = new Map<string, string>();
    for (let index = 0; index < works.length; index++) {
      const work = works[index],
        p = await input.body(work.id),
        binding: any = { questions: {} },
        projects: Record<string, string> = {},
        studentArtifacts: Record<string, StudentArtifact> = {};
      const contexts = [{ work, body: p, menu: false }];
      for (const menu of unitMenus.get(work.id) ?? []) {
        let body = menuBodies.get(menu.id);
        if (!body) {
          body = await input.body(menu.id);
          menuBodies.set(menu.id, body);
        }
        contexts.push({
          work: menu,
          body,
          menu: true,
        });
      }
      const overviewParts: string[] = [];
      for (const context of contexts) {
        const publicWork = context.body.works?.[0];
        if (
          !publicWork ||
          publicWork.key !== input.courseId + "/" + context.work.id ||
          context.body.owner !== input.courseId ||
          context.body.schema !== "course-body-package-v2" ||
          !Array.isArray(context.body.resources) ||
          context.menu && (publicWork.source !== context.work.source ||
              !Array.isArray(publicWork.introduction)) ||
          publicWork.introduction !== undefined &&
            !Array.isArray(publicWork.introduction)
        ) {
          throw new Error(
            "PL публичное введение не соответствует работе: " + context.work.id,
          );
        }
        if (
          (context.menu || unitMenus.has(context.work.id)) &&
          canonical(publicWork.slots) !==
            canonical(qualifiedSlots(input.courseId, context.work))
        ) {
          throw Error(
            "PL публичный состав не соответствует source unit/menu: " +
              context.work.id,
          );
        }
        // Only the independent public projection; never raw menu.body/full AST.
        const rendered = await renderPublicBody(
          context.body,
          publicWork.introduction ?? [],
          publicWork.key,
          {
            source: publicWork.source,
            id: context.work.id,
            field: "introduction",
          },
          "clientFilesCourse",
          "{{ client_files_course }}",
          {
            preserveBibliography: input.nativeBody,
            auxiliary: input.nativeAuxiliary,
          },
        );
        overviewParts.push(rendered.html);
        for (const file of rendered.files) {
          const target = join(stage, file.name);
          await Deno.mkdir(dirname(target), { recursive: true });
          try {
            if (
              !isDeepStrictEqual(await Deno.readFile(target), file.data)
            ) {
              throw new Error(
                "PL конфликт публичного ресурса обзора: " + file.name,
              );
            }
          } catch (e) {
            if (!(e instanceof Deno.errors.NotFound)) throw e;
            await Deno.writeFile(target, file.data);
          }
        }
      }
      const overview = { html: overviewParts.join("\n") };
      for (const q of p.questions) {
        const e = content.exercises.find((e) => e.id === q.id);
        if (e?.target !== "prairielearn") {
          throw new Error("PL selected member target mismatch");
        }
        const settings = question({
          topic: e.extensions?.prairielearn?.topic ?? d.defaults.topic,
          submission: e.extensions?.prairielearn?.submission ??
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
        const method = gradingMethod(settings.grading).method;
        if (input.nativeAnswers?.[q.id]) {
          binding.questions[q.id] = { ...settings, files: [] };
          questions[input.courseId + "/" + q.id] = nativeAnswerBinding(
            await uuid(input.courseId + "/" + q.id),
            method,
            input.nativeAnswers[q.id],
            input.nativeResponseSlots?.[q.id] ?? [],
          );
          continue;
        }
        const artifactFact = content.projects?.find((f) =>
          f.exerciseId === q.id && f.bankMember
        );
        if (!artifactFact) {
          throw Error("PL student artifact project fact missing");
        }
        studentArtifacts[q.id] = await input.studentArtifact(artifactFact);
        if (method === "manual") {
          const fact = content.projects?.find((f) =>
            f.exerciseId === q.id && f.bankMember
          );
          if (!fact || fact.check || !safePath(fact.projectRoot)) {
            throw Error(
              "PL.MANUAL_INVALID: manual требует project без project-check",
            );
          }
          let actual = input.projectRoot;
          for (const part of fact.projectRoot.split("/")) {
            actual = join(actual, part);
            if ((await Deno.lstat(actual)).isSymlink) {
              throw Error("PL manual project symlink forbidden");
            }
          }
          const files = studentArtifacts[q.id].files.map((f) => ({
            name: f.name,
            data: f.bytes,
          }));
          if (!files.length) throw Error("PL manual student files missing");
          const project = join(scratch, q.id);
          projects[q.id] = "/" + q.id;
          for (const file of files) {
            const path = join(project, "student", file.name);
            await Deno.mkdir(dirname(path), { recursive: true });
            await Deno.writeFile(path, file.data);
          }
          const javaSources = studentArtifacts[q.id].files.filter(file => file.reason === "starter" && applicationJavaTarget(file.name));
          const selectedSubmission = settings.submission.mode !== "workspace" && javaSources.length
            ? fileSubmission(javaSources.map(file => file.name), settings.submission.mode === "editor" ? settings.submission.aceMode : undefined)
            : settings.submission;
          binding.questions[q.id] = { ...settings, submission: selectedSubmission, files: javaSources.map(file => file.name) };
          questions[input.courseId + "/" + q.id] = {
            uuid: await uuid(input.courseId + "/" + q.id),
            grading: { method: "manual" },
            submission: { ...selectedSubmission },
            sourceRoot: fact.projectRoot,
          };
          continue;
        }
        const fact = input.checks.projects.find((p) =>
          p.exerciseId === q.id && p.bankMember
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
          ![1, 2].includes(input.registry.schemaVersion) || !profile ||
          profile.mode !== fact.check.sourceProfile.mode
        ) throw new Error("PL runtime profile unavailable");
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
        projects[q.id] = "/" + q.id;
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
        const c = fact.check, descriptor = nativeSelection.descriptor;
        const selectedSubmission = ["java25-junit-v1", "java25-gradle-junit-v1"].includes(c.runtime)
          ? fileSubmission(sources.map(source => source.name), settings.submission.mode === "editor" ? settings.submission.aceMode : undefined)
          : settings.submission;
        await Deno.writeTextFile(
          join(project, "tests/grading-job.json"),
          JSON.stringify(descriptor, null, 2) + "\n",
        );
        binding.questions[q.id] = {
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
        questions[key] = {
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
      }
      const partial = join(scratch, "work-" + index);
      await exportPrairieLearn(
        p,
        {
          projectRoot: scratch,
          nativeBody: input.nativeBody,
          nativeAuxiliary: input.nativeAuxiliary,
          projects,
          studentArtifacts,
          nativeAnswers: input.nativeAnswers,
        },
        binding,
        partial,
      );
      for (const q of p.questions) {
        const base = "questions/" + q.key;
        const c = input.checks.projects.find((f) => f.exerciseId === q.id)
          ?.check;
        const info = JSON.parse(
          await Deno.readTextFile(join(partial, base, "info.json")),
        );
        info.partialCredit = input.nativeAnswers?.[q.id]
          ? info.gradingMethod !== "Manual"
          : c
          ? c.scoring.mode !== "all-pass"
          : false;
        // Pinned Community validates assessment overrides against this embedded
        // question schema. A sidecar preferences.schema.json is not loaded.
        info.preferences = {
          courseRequirement: {
            type: "string",
            default: "required",
            enum: ["required", "optional"],
          },
        };
        await Deno.writeTextFile(
          join(partial, base, "info.json"),
          JSON.stringify(info, null, 2) + "\n",
        );
        const f = input.checks.projects.find((f) => f.exerciseId === q.id);
        if (f?.check) {
          for (
            const s of input.nativeInputs[q.id].sources.map((file) => ({
              name: file.name,
              data: file.bytes,
            }))
          ) {
            const path = join(
              partial,
              base,
              "serverFilesQuestion/starter",
              s.name,
            );
            await Deno.mkdir(dirname(path), { recursive: true });
            await Deno.writeFile(path, s.data);
          }
        }
        const nativeFiles = await inventoryNames(join(partial, base));
        const resourceBindings = [...new Map<string, BodyResource>(
          p.resources
            .filter((resource) =>
              nativeFiles.includes(
                "clientFilesQuestion/" + resource.target,
              )
            )
            .map((resource) => [resource.target, resource]),
        ).values()]
          .sort((left, right) => left.target.localeCompare(right.target));
        const snapshot = canonical({
          question: q,
          binding: binding.questions[q.id],
          grading: questions[q.key],
          resourceBindings,
        });
        if (await exists(join(stage, base))) {
          if (
            questionSnapshots.get(q.key) !== snapshot ||
            !await sameQuestionFiles(
              join(stage, base),
              join(partial, base),
              nativeFiles,
            )
          ) {
            throw Error("PL конфликт повторного вопроса: " + q.key);
          }
        } else {
          questionSnapshots.set(q.key, snapshot);
          await Deno.rename(
            join(partial, base),
            await parent(join(stage, base)),
          );
        }
        await write(base + "/info.json", info);
      }
      const policy = work.extensions.prairielearn;
      const completion = completionPolicy(input.courseId, work);
      const grading = gradingPolicy(work);
      const assessmentType = ["test", "practical"].includes(work.kind)
        ? "Exam"
        : "Homework";
      await write(
        "courseInstances/" + input.instance + "/assessments/" + work.id +
          "/infoAssessment.json",
        {
          uuid: assessmentUuids.get(work.id),
          type: assessmentType,
          title: work.title,
          set: assessmentType,
          number: String(index + 1),
          ...grading.assessment,
          text: overview.html +
            `<p>Выполните не менее ${completion.atLeast} обязательных позиций полностью. Частичный результат и необязательные позиции не заменяют обязательные.</p>`,
          accessControl: (work.relatedExercise
            ? [{
              beforeRelease: { listed: false },
              dateControl: {
                release: { date: "9999-12-31T00:00:00" },
                due: { date: null },
              },
            }, {
              uuid: await identity(
                "access/" + input.instance + "/" + work.id,
                courseUuid,
              ),
              labels: [
                policy.assignment && "student-label" in policy.assignment
                  ? policy.assignment["student-label"]
                  : undefined,
              ],
              dateControl: {
                release: { date: "1970-01-01T00:00:00" },
                due: { date: null },
              },
            }]
            : [{
              dateControl: {
                release: { date: "1970-01-01T00:00:00" },
                due: { date: null },
              },
            }]).map((rule) =>
              work.kind === "lab"
                ? {
                  ...rule,
                  afterComplete: {
                    questions: { hidden: false },
                    score: { hidden: false },
                  },
                }
                : rule
            ),
          zones: nativeSlotZones(input.courseId, work, grading),
        },
      );
    }
    const files = await inventoryNames(stage);
    const version = 5;
    {
      for (const [key, value] of Object.entries(questions) as [string, any][]) {
        if (value.kind === "native-answer") continue;
        if (value.submission.mode === "workspace") {
          const prefix = "questions/" + key + "/workspace/.pl-seed/";
          if (
            !files.includes(prefix + "starter.zip") ||
            !files.includes(prefix + "manifest.json")
          ) throw Error("PL.WORKSPACE_SEED_REQUIRED");
          questions[key] = {
            ...value,
            kind: "workspace",
            upstreamGradingMethod: "Manual",
            singleVariant: true,
            seed: {
              schema: "pl-git-workspace-seed-v1",
              archive: "workspace/.pl-seed/starter.zip",
              manifest: "workspace/.pl-seed/manifest.json",
            },
          };
        } else questions[key] = { kind: "project", ...value };
      }
    }
    const delivery: any = {
      schemaVersion: version,
      courseId: input.courseId,
      bookRoot: input.checks.bookRoot,
      questions: Object.keys(questions).sort(),
      gradingPayloads: questions,
      works: works.map((w) => ({
        id: w.id,
        slots: qualifiedSlots(input.courseId, w),
        policy: Object.fromEntries(
          Object.entries(w.extensions.prairielearn).filter(([key]) =>
            w.relatedExercise || key !== "assignment"
          ),
        ),
        completion: completionPolicy(input.courseId, w),
        ...(w.relatedExercise ? { relatedExercise: w.relatedExercise } : {}),
      })),
      instances: {
        [input.instance]: {
          works: d.instance.works,
          selfEnrollment: d.instance["self-enrollment"],
        },
      },
      files: files.sort(),
      ...(input.candidateImage ? { candidate: true } : {}),
    };
    await write("delivery.json", delivery);
    await Deno.mkdir(dirname(privateOut), { recursive: true });
    const privateStage = await Deno.makeTempFile({
      dir: dirname(privateOut),
      prefix: ".pl-checks-",
    });
    await Deno.writeTextFile(
      privateStage,
      JSON.stringify(input.checks, null, 2) + "\n",
    );
    let state = "prepared";
    const discard = async () => {
      if (state !== "prepared") return;
      state = "discarded";
      for (const path of [stage, privateStage]) {
        try {
          await Deno.remove(path, { recursive: true });
        } catch (error) {
          if (!(error instanceof Deno.errors.NotFound)) throw error;
        }
      }
    };
    const publish = async () => {
      if (state !== "prepared") {
        throw Error("PL export preparation already consumed");
      }
      try {
        await absent(out);
        await absent(privateOut);
        await Deno.rename(privateStage, privateOut);
        try {
          await Deno.rename(stage, out);
        } catch (error) {
          await Deno.remove(privateOut);
          throw error;
        }
        state = "published";
        return delivery;
      } catch (error) {
        await discard();
        throw error;
      }
    };
    if (input.deferPublish) return { delivery, publish, discard };
    return await publish();
  } catch (e) {
    try {
      await Deno.remove(stage, { recursive: true });
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    }
    throw e;
  } finally {
    await Deno.remove(scratch, { recursive: true });
  }
}
async function exists(path: string) {
  try {
    await Deno.stat(path);
    return true;
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) return false;
    throw e;
  }
}
async function parent(path: string) {
  await Deno.mkdir(dirname(path), { recursive: true });
  return path;
}

// @ts-expect-error JS допускает замену function binding; сигнатура публичного API сохраняется.
identity = __metrics.wrapAsync({
  id: "course-prairielearn.application.export-course.identity",
  kind: "phase",
}, identity);
// @ts-expect-error JS допускает замену function binding; сигнатура публичного API сохраняется.
exportCourse = __metrics.wrapAsync({
  id: "course-prairielearn.application.export-course.exportCourse",
  kind: "phase",
}, exportCourse);
