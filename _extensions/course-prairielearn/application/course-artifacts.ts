import { upstreamCourseValidationInput } from "./native-course-options.ts";
import type { BodyResource, PublicBodyPackage } from "course-core/public.ts";
import type { CourseExportPlan } from "./course-export-plan.ts";
import type { OwnedExportOutput } from "./export-output.ts";
import type { courseQuestionInput } from "./course-question-input.ts";
import { dirname, join, relative } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { canonical } from "./source-selection.ts";
import { validateAssessmentSemantics } from "./native-semantics.ts";
// @deno-types="./native-validators.d.ts"
import * as validators from "./native-validators.js";
export async function inventoryNames(root: string) {
  const files: string[] = [];
  async function walk(dir: string) {
    for (const e of [...(await Array.fromAsync(Deno.readDir(dir)))].sort(
      (a, b) => a.name.localeCompare(b.name),
    )) {
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
    )
      return false;
  }
  return true;
}
type WorkInput = Awaited<ReturnType<typeof courseQuestionInput>>;
export class CourseArtifacts {
  private readonly nativeUuidOwners = new Map<string, string>();
  private readonly questionSnapshots = new Map<string, string>();
  constructor(
    private readonly plan: CourseExportPlan,
    private readonly output: OwnedExportOutput,
  ) {}
  async write(path: string, v: unknown) {
    const schema = path.endsWith("/info.json")
      ? "infoQuestion"
      : path.split("/").at(-1)?.replace(".json", "");
    const validate =
      schema === "infoQuestion"
        ? validators.infoQuestion
        : schema === "infoCourse"
          ? validators.infoCourse
          : schema === "infoCourseInstance"
            ? validators.infoCourseInstance
            : schema === "infoAssessment"
              ? validators.infoAssessment
              : undefined;
    const validationInput =
      schema === "infoCourse" ? upstreamCourseValidationInput(v) : v;
    if (validate && !validate(validationInput)) {
      throw new Error(
        "PL upstream schema " + path + ": " + JSON.stringify(validate.errors),
      );
    }
    if (schema === "infoAssessment") validateAssessmentSemantics(v, path);
    if (
      validate &&
      v !== null &&
      typeof v === "object" &&
      "uuid" in v &&
      typeof v.uuid === "string"
    ) {
      const key = v.uuid.toLowerCase(),
        previous = this.nativeUuidOwners.get(key);
      if (previous !== undefined && previous !== path) {
        throw Error(
          `PL.ASSESSMENT_INVALID: повторный UUID ${v.uuid}: ${previous} и ${path}`,
        );
      }
      this.nativeUuidOwners.set(key, path);
    }
    await this.output.writeJson(path, v);
  }
  async importQuestions(
    p: PublicBodyPackage,
    binding: WorkInput["binding"],
    deliveries: WorkInput["questions"],
    partial: string,
  ) {
    const { input } = this.plan,
      stage = this.output.stage;
    for (const q of p.questions) {
      const base = "questions/" + q.key;
      const c = input.checks.projects.find((f) => f.exerciseId === q.id)?.check;
      const rawInfo: unknown = JSON.parse(
        await Deno.readTextFile(join(partial, base, "info.json")),
      );
      if (!rawInfo || typeof rawInfo !== "object" || Array.isArray(rawInfo)) {
        throw Error("PL invalid question info");
      }
      const info: Record<string, unknown> = Object.fromEntries(
        Object.entries(rawInfo),
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
        const nativeInput = input.nativeInputs[q.id];
        if (!nativeInput) {
          throw Error("PL.SELECTION_INVALID: native input missing");
        }
        for (const s of nativeInput.sources.map((file) => ({
          name: file.name,
          data: file.bytes,
        }))) {
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
      const resourceBindings = [
        ...new Map<string, BodyResource>(
          p.resources
            .filter((resource) =>
              nativeFiles.includes("clientFilesQuestion/" + resource.target),
            )
            .map((resource) => [resource.target, resource]),
        ).values(),
      ].sort((left, right) => left.target.localeCompare(right.target));
      const snapshot = canonical({
        question: q,
        binding: binding.questions[q.id],
        grading: deliveries[q.key],
        resourceBindings,
      });
      if (await exists(join(stage, base))) {
        if (
          this.questionSnapshots.get(q.key) !== snapshot ||
          !(await sameQuestionFiles(
            join(stage, base),
            join(partial, base),
            nativeFiles,
          ))
        ) {
          throw Error("PL конфликт повторного вопроса: " + q.key);
        }
      } else {
        this.questionSnapshots.set(q.key, snapshot);
        await Deno.rename(join(partial, base), await parent(join(stage, base)));
      }
      await this.write(base + "/info.json", info);
    }
  }
}
async function exists(path: string) {
  try {
    await Deno.stat(path);
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return false;
    throw error;
  }
}
async function parent(path: string) {
  await Deno.mkdir(dirname(path), { recursive: true });
  return path;
}
