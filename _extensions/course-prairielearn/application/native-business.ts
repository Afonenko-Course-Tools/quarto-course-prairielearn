import { decodeNativeMaterialization } from "./native-materialization.ts";
// @deno-types="../vendor/zod/v4/index.d.ts"
import { z } from "../vendor/zod/v4/index.js";
import { createHash } from "node:crypto";
import { closed, declarations, question } from "./declarations.ts";
import { gradingPolicy, validateGradingComponents } from "./grading-policy.ts";
import {
  nativeCheckScalars,
  NativeProjectChecksSchema,
} from "./native-checks.ts";

const amount = z.number().nonnegative().finite();
const points = z.union([amount, z.array(amount).min(1).max(4096)]);
const questionScore = {
  "auto-points": amount.optional(),
  "manual-points": z.number().positive().finite().optional(),
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
export function nativePolicy(value: unknown): any {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const result: any = structuredClone(value);
  for (
    const key of [
      "attempts",
      "question-points",
      "question-max-points",
      "max-points",
      "grade-rate-minutes",
      "advance-score-perc",
      "auto-points",
      "manual-points",
    ]
  ) {
    const numeric = (v: unknown) =>
      typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))
        ? Number(v)
        : v;
    if (Object.hasOwn(result, key)) {
      result[key] = Array.isArray(result[key])
        ? result[key].map(numeric)
        : numeric(result[key]);
    }
  }
  if (result.pass && typeof result.pass === "object") {
    result.pass["at-least"] = typeof result.pass["at-least"] === "string"
      ? Number(result.pass["at-least"])
      : result.pass["at-least"];
  }
  if (result["slot-overrides"]) {
    for (const id of Object.keys(result["slot-overrides"])) {
      result["slot-overrides"][id] = nativePolicy(result["slot-overrides"][id]);
    }
  }
  return result;
}
function mergePolicy(base: any, local: any): any {
  if (!local || typeof local !== "object" || Array.isArray(local)) return local;
  const out = { ...base };
  for (const [key, value] of Object.entries(local)) {
    out[key] = key !== "assignment" && value && typeof value === "object" &&
        !Array.isArray(value) && out[key] && typeof out[key] === "object" &&
        !Array.isArray(out[key])
      ? mergePolicy(out[key], value)
      : value;
  }
  return out;
}
/** Полный raw канон проверяется до Core audience projection. */
export function validateNativeRaw(
  value: unknown,
  context: { source?: string } = {},
) {
  const raw = NativeBusinessSchema.parse(structuredClone(value)),
    config = (raw.config ?? {}) as any;
  // Pandoc представляет numeric metadata scalar как Inlines; нормализация принадлежит PL.
  const port = config["question-defaults"]?.submission?.workspaceOptions?.port;
  if (typeof port === "string" && /^\d+$/.test(port)) {
    config["question-defaults"].submission.workspaceOptions.port = Number(port);
  }
  closed(config, [], ["delivery", "question-defaults", "assessment-defaults"]);
  if (config.delivery !== undefined) {
    const keys = Object.keys(config.delivery?.instances ?? {});
    if (!keys.length) throw Error("PL.DECLARATION_INVALID: пустые instances");
    declarations({
      ...config,
      "assessment-defaults": config["assessment-defaults"] === undefined
        ? undefined
        : nativePolicy(config["assessment-defaults"]),
    }, keys[0]);
  }
  if (config["question-defaults"] !== undefined) {
    question(config["question-defaults"]);
  }
  const defaults = AssessmentDefaultsSchema.parse(
    nativePolicy(config["assessment-defaults"] ?? {}),
  );
  const ownAttrs = new Set([
    "prairielearn-topic",
    "prairielearn-submission",
    "prairielearn-single-variant",
    "prairielearn-grading",
  ]);
  for (const declaration of raw.declarations) {
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
  if (raw.projectChecks !== undefined) {
    NativeProjectChecksSchema.parse(nativeCheckScalars(raw.projectChecks));
  }
  const materialization = raw.materialization === undefined
    ? undefined
    : decodeNativeMaterialization(raw.materialization, context.source);
  return { raw, config, defaults, materialization };
}
/** Чистая PL business validation: не создаёт Core capability/release proof. */
export function decodeNativeBusiness(
  value: unknown,
  input: any,
  options: { deferComposition?: boolean } = {},
) {
  const { raw, config, defaults, materialization } = validateNativeRaw(value, {
    source: input.origin?.source,
  });
  const questions: Record<
    string,
    ReturnType<typeof question> & {
      grading: { method: "external" | "manual" | "mixed" };
    }
  > = {};
  for (const declaration of input.declarations) {
    if (!raw.declarations.some((d) => d.id === declaration.id)) {
      throw Error("PL.CAPTURE_CHANGED: декларация отсутствует в raw каноне");
    }
    const original = raw.declarations.find((d) => d.id === declaration.id)!;
    if (Boolean(original.answer) !== Boolean(declaration.answer)) {
      throw Error("PL.ANSWER_UNQUALIFIED: raw/native answer mismatch");
    }
    const attrs = declaration.attributes, base = config["question-defaults"];
    if (!base) {
      throw Error("PL.DECLARATION_INVALID: требуются question-defaults");
    }
    const authored = structuredClone(base);
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
      authored.submission = {
        ...authored.submission,
        mode: attrs["prairielearn-submission"],
      };
      if (authored.submission.mode !== "editor") {
        delete authored.submission["ace-mode"];
      }
      if (authored.submission.mode !== "workspace") {
        delete authored.submission.workspaceOptions;
      }
    }
    const parsed = question(authored);
    questions[declaration.id] = {
      ...parsed,
      grading: parsed.grading ?? { method: "external" },
    };
  }
  let assessment: any;
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
    const required = input.assessment.slots.filter((s: any) =>
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
    if (
      input.assessment.slots.every((s: any) =>
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
  return { questions, assessment, raw, materialization };
}
