import type { NativeAdapterValidationInput } from "course-core/public.ts";
/** Реально читаемые поля Core input; schema/authenticity остаются у Core boundary.
 * Полный preprojection input структурно совместим без копирования/приведения. */
export type NativeBusinessInput = Pick<NativeAdapterValidationInput, "declarations"> & {
  assessment?: Pick<NonNullable<NativeAdapterValidationInput["assessment"]>, "id" | "kind" | "slots"> | undefined;
  origin?: Pick<NativeAdapterValidationInput["origin"], "source"> | undefined;
  course: Partial<NativeAdapterValidationInput["course"]>;
};
import {
  decodeNativeMaterialization,
  NativeSeedTargetsSchema,
} from "./native-materialization.ts";
// @deno-types="../vendor/zod/v4/index.d.ts"
import { z } from "../vendor/zod/v4/index.js";
import { createHash } from "node:crypto";
import {
  closed,
  object,
  declarations,
  publicationQuestion,
  question,
} from "./declarations.ts";
import {
  assessmentUuidPattern,
  gradingPolicy,
  validateGradingComponents,
} from "./grading-policy.ts";
import { parseNativeChecks } from "./native-checks.ts";

const amount = z.number().nonnegative().finite();
const points = z.union([amount, z.array(amount).min(1).max(4096)]);
const questionScore = {
  "auto-points": amount.optional(),
  "manual-points": amount.optional(),
  "question-points": points.optional(),
  "question-max-points": amount.nullable().optional(),
  attempts: z.number().int().positive().optional(),
  "advance-score-perc": amount.max(100).optional(),
};
export const AssignmentPolicySchema = z.union([
  z.strictObject({ mode: z.literal("assessment-id") }),
  z.strictObject({ "student-label": z.string().regex(/^[a-z][a-z0-9-]*$/) }),
]);
export const ScoringPolicySchema = z.strictObject({
  ...questionScore,
  "slot-overrides": z.record(
    z.string().regex(/^(exr|alt)-[a-z0-9-]+$/),
    z.strictObject(questionScore),
  ).optional(),
  "max-points": amount.nullable().optional(),
  "grade-rate-minutes": amount.optional(),
  "allow-multiple-instances": z.boolean().optional(),
});
export const AssessmentPolicySchema = ScoringPolicySchema.extend({
  uuid: z.string().regex(
    assessmentUuidPattern,
    "Ожидается native UUID контрольной работы",
  ).optional(),
  pass: z.strictObject({ "at-least": z.number().int().positive() }),
  attempts: z.number().int().positive(),
  assignment: AssignmentPolicySchema.optional(),
});
export const AssessmentDefaultsSchema = ScoringPolicySchema.extend({
  pass: z.strictObject({ "at-least": z.number().int().positive() }).optional(),
  assignment: AssignmentPolicySchema.optional(),
});
export const NativeBusinessSchema = z.strictObject({
  config: z.record(z.string(), z.unknown()).optional(),
  assessment: z.unknown().optional(),
  projectChecks: z.unknown().optional(),
  materialization: z.unknown().optional(),
  declarations: z.array(
    z.strictObject({
      id: z.string().regex(/^exr-[a-z0-9-]+$/),
      attributes: z.record(z.string(), z.string()),
      answer: z.unknown().optional(),
    }),
  ).max(4096),
});
export type NativeBusiness = z.output<typeof NativeBusinessSchema>;
/** Нормализация native Pandoc scalars; metadata inheritance уже выполнил Quarto. */
export function nativePolicy(value: unknown): unknown {
  if (!object(value)) return value;
  const result = structuredClone(value);
  for (const key of ["attempts", "question-points", "question-max-points", "max-points",
    "grade-rate-minutes", "advance-score-perc", "auto-points", "manual-points"]) {
    const numeric = (v: unknown) => typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))
      ? Number(v) : v;
    if (Object.hasOwn(result, key)) {
      const field = result[key];
      result[key] = Array.isArray(field) ? field.map(numeric) : numeric(field);
    }
  }
  const pass = result.pass;
  if (object(pass)) {
    pass["at-least"] = typeof pass["at-least"] === "string" ? Number(pass["at-least"]) : pass["at-least"];
  }
  const overrides = result["slot-overrides"];
  if (object(overrides)) {
    for (const id of Object.keys(overrides)) overrides[id] = nativePolicy(overrides[id]);
  }
  return result;
}
function mergePolicy(base: Record<string, unknown>, local: unknown): unknown {
  if (!object(local)) return local;
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(local)) {
    const prior = out[key];
    out[key] = key !== "assignment" && object(value) && object(prior)
      ? mergePolicy(prior, value) : value;
  }
  return out;
}
function validateRawDeclarations(
  declarations: z.output<typeof NativeBusinessSchema>["declarations"],
) {
  const ownAttrs = new Set([
    "prairielearn-topic",
    "prairielearn-submission",
    "prairielearn-submission-layout",
    "prairielearn-single-variant",
    "prairielearn-grading",
  ]);
  for (const declaration of declarations) {
    for (const [key, value] of Object.entries(declaration.attributes)) {
      if (key.startsWith("prairielearn-")) {
        if (!ownAttrs.has(key)) {
          throw Error("PL.DECLARATION_INVALID: неизвестное поле " + key);
        }
        if (
          key === "prairielearn-grading" &&
          !["external", "manual", "mixed"].includes(value)
        ) throw Error("PL.GRADING_INVALID: " + declaration.id);
        if (
          key === "prairielearn-submission" &&
          !["editor", "upload", "workspace"].includes(value)
        ) throw Error("PL.SUBMISSION_INVALID: " + declaration.id);
        if (
          key === "prairielearn-single-variant" &&
          !["true", "false"].includes(value)
        ) throw Error("PL.DECLARATION_INVALID: single-variant");
        if (key === "prairielearn-topic" && !value.trim()) {
          throw Error("PL.DECLARATION_INVALID: topic");
        }
      }
    }
    if (declaration.answer !== undefined && declaration.answer !== true) {
      throw Error(
        "PL.ANSWER_UNQUALIFIED: raw answer требует отдельного проверенного транспорта",
      );
    }
  }
}
/** Полный raw канон проверяется до Core audience projection. */
function readNativeRaw(
  value: unknown,
  context: { source?: string },
  parseQuestion: (value: unknown) => unknown,
) {
  const raw = NativeBusinessSchema.parse(structuredClone(value)),
    config = raw.config ?? {};
  // Pandoc представляет numeric metadata scalar как Inlines; нормализация принадлежит PL.
  const questionDefaults = config["question-defaults"];
  const submission = object(questionDefaults) ? questionDefaults.submission : undefined;
  const workspace = object(submission) ? submission.workspaceOptions : undefined;
  const port = object(workspace) ? workspace.port : undefined;
  if (object(workspace) && typeof port === "string" && /^\d+$/.test(port)) workspace.port = Number(port);
  closed(config, [], [
    "delivery",
    "question-defaults",
    "assessment-defaults",
    "seed-targets",
  ]);
  if (config["seed-targets"] !== undefined) {
    NativeSeedTargetsSchema.parse(config["seed-targets"]);
  }
  if (config.delivery !== undefined) {
    const delivery = config.delivery;
    const instances = object(delivery) ? delivery.instances : undefined;
    const keys = Object.keys(object(instances) ? instances : {});
    const firstKey = keys[0];
    if (firstKey === undefined) throw Error("PL.DECLARATION_INVALID: пустые instances");
    declarations({
      ...config,
      "assessment-defaults": config["assessment-defaults"] === undefined
        ? undefined
        : nativePolicy(config["assessment-defaults"]),
    }, firstKey);
  }
  if (config["question-defaults"] !== undefined) {
    parseQuestion(config["question-defaults"]);
  }
  const defaults = AssessmentDefaultsSchema.parse(
    nativePolicy(config["assessment-defaults"] ?? {}),
  );
  validateRawDeclarations(raw.declarations);
  const projectChecks = raw.projectChecks === undefined
    ? undefined : parseNativeChecks(raw.projectChecks);
  const materialization = raw.materialization === undefined
    ? undefined
    : decodeNativeMaterialization(raw.materialization, context.source);
  return { raw, config, defaults, materialization, projectChecks };
}
/** Чистая PL business validation: не создаёт Core capability/release proof. */
export function validateNativeRaw(
  value: unknown,
  context: { source?: string } = {},
) {
  return readNativeRaw(value, context, question);
}
function decodeBusiness<
  Q extends Partial<ReturnType<typeof publicationQuestion>>,
>(
  value: unknown,
  input: NativeBusinessInput,
  options: { deferComposition?: boolean },
  parseQuestion: (value: unknown) => Q,
  completeGrading: boolean,
) {
  const { raw, config, defaults, materialization, projectChecks } = readNativeRaw(value, input.origin ? {source: input.origin.source} : {}, parseQuestion);
  const questions: Record<
    string,
    Q & {
      grading: { method: "external" | "manual" | "mixed" };
    }
  > = {};
  for (const declaration of input.declarations) {
    if (!raw.declarations.some((d) => d.id === declaration.id)) {
      throw Error("PL.CAPTURE_CHANGED: декларация отсутствует в raw каноне");
    }
    const original = raw.declarations.find((d) => d.id === declaration.id);
    if (!original) throw Error("PL.CAPTURE_CHANGED: декларация отсутствует в raw каноне");
    if (Boolean(original.answer) !== Boolean(declaration.answer)) {
      throw Error("PL.ANSWER_UNQUALIFIED: raw/native answer mismatch");
    }
    const attrs = declaration.attributes, base = config["question-defaults"];
    const authored: Record<string, unknown> = structuredClone(object(base) ? base : {});
    if (attrs["prairielearn-topic"] !== undefined) {
      authored.topic = attrs["prairielearn-topic"];
    }
    if (attrs["prairielearn-grading"] !== undefined) {
      authored.grading = attrs["prairielearn-grading"] === "external"
        ? "external"
        : { method: attrs["prairielearn-grading"] };
    }
    if (attrs["prairielearn-single-variant"] !== undefined) {
      authored["single-variant"] =
        attrs["prairielearn-single-variant"] === "true";
    }
    if (attrs["prairielearn-submission"] !== undefined) {
      const submission: Record<string, unknown> = {
        ...(object(authored.submission) ? authored.submission : {}),
        mode: attrs["prairielearn-submission"],
      };
      if (submission.mode !== "editor") delete submission["ace-mode"];
      if (submission.mode !== "workspace") delete submission.workspaceOptions;
      if (submission.mode !== "upload") delete submission.layout;
      authored.submission = submission;
    }
    if (attrs["prairielearn-submission-layout"] !== undefined) {
      authored.submission = { ...(object(authored.submission) ? authored.submission : {}),
        layout: attrs["prairielearn-submission-layout"] };
    }
    const parsed = parseQuestion(authored);
    questions[declaration.id] = {
      ...parsed,
      grading: parsed.grading ?? { method: "external" },
    };
  }
  let assessment: z.output<typeof AssessmentPolicySchema> | undefined;
  if (raw.assessment !== undefined) {
    if (!input.assessment) {
      throw Error("PL.ASSESSMENT_INVALID: нет Core assessment composition");
    }
    assessment = AssessmentPolicySchema.parse(
      mergePolicy(defaults, nativePolicy(raw.assessment)),
    );
    if (!assessment.assignment) {
      throw Error("PL.ASSESSMENT_INVALID: требуется явное assignment");
    }
    if ("mode" in assessment.assignment && input.course.id) {
      assessment.assignment = {
        "student-label": "pl-" +
          createHash("sha1").update(
            input.course.id + "\0" + input.assessment.id,
          ).digest("hex"),
      };
    }
    const required = input.assessment.slots.filter((s) =>
      s.assignment.requirement === "required"
    );
    if (assessment.pass["at-least"] > required.length) {
      throw Error("PL.ASSESSMENT_INVALID: порог выше числа required позиций");
    }
    const methods = Object.fromEntries(
      Object.entries(questions).map(([id, q]) => [id, q.grading.method]),
    );
    const work = {
      ...input.assessment,
      extensions: { prairielearn: assessment },
    };
    // Для чужих документов состав сверяет полная операция; local native membership проверяется здесь.
    if (!completeGrading) {
      // Partial publication vet проверяет форму/порог; pricing требует полной delivery.
    } else if (
      input.assessment.slots.every((s) =>
        s.candidates.every((id: string) => methods[id] !== undefined)
      )
    ) validateGradingComponents(work, methods);
    else if (!options.deferComposition) {
      gradingPolicy(work);
      throw Error(
        "PL.ASSESSMENT_UNQUALIFIED: требуется полная cross-document grading composition",
      );
    }
  }
  return {
    questions,
    assessment,
    raw,
    materialization,
    projectChecks,
    seedTargets: NativeSeedTargetsSchema.parse(config["seed-targets"] ?? {}),
  };
}

/** Полная delivery не получает неполные topic/submission через publication parser. */
export function decodeNativeBusiness(
  value: unknown,
  input: NativeBusinessInput,
  options: { deferComposition?: boolean } = {},
) {
  return decodeBusiness(value, input, options, question, true);
}
/** Чистая частичная publication validation, без delivery/proof/operation authority. */
export function decodePublicationBusiness(
  value: unknown,
  input: NativeBusinessInput,
  options: { deferComposition?: boolean } = {},
) {
  return decodeBusiness(value, input, options, publicationQuestion, false);
}

/** Только проверка уже декодированных authentic inputs полной native операции.
 * Inherited map может ссылаться на другой source; каждый target имеет одного owner.
 */
export function assertNativeSeedTargets(
  rows: readonly ReturnType<typeof decodeNativeBusiness>[],
) {
  for (const row of rows) {
    for (const [id, target] of Object.entries(row.seedTargets)) {
      const owners = rows.filter((owner) => Object.hasOwn(owner.questions, id));
      if (owners.length !== 1) {
        throw Error(
          "PL.SEED_TARGET_INVALID: неизвестный или неоднозначный project ID",
        );
      }
      const owner = owners[0];
      if (!owner) throw Error("PL.SEED_TARGET_INVALID: missing owner");
      const settings = owner.questions[id];
      if (!settings) throw Error("PL.SEED_TARGET_INVALID: missing settings");
      if (
        owner.seedTargets[id] !== target ||
        owner.materialization?.projects[id]?.["include-git"] !== true
      ) {
        throw Error(
          "PL.SEED_TARGET_INVALID: target не связан с authoritative include-git project",
        );
      }
      if (
        !["upload", "workspace"].includes(settings.submission.mode) ||
        settings.submission.mode === "workspace" && target !== "work"
      ) {
        throw Error(
          "PL.SEED_TARGET_INVALID: поддержаны upload target или прежний Workspace work",
        );
      }
    }
  }
}
