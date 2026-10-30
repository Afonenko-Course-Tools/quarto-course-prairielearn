// @deno-types="../vendor/zod/v4/index.d.ts"
import { z } from "../vendor/zod/v4/index.js";
import { safePath } from "./source-selection.ts";
const text = z.string().min(1).max(8192), path = text.refine(safePath);
const strings = z.array(path).max(4096);
const positive = z.number().positive().finite(),
  integer = z.number().int().positive();
const api = z.strictObject({
  files: strings.min(1),
  entry: text.regex(
    /^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/,
  ),
});
const count = z.strictObject({
  "at-least": z.number().int().nonnegative().optional(),
  exactly: z.number().int().nonnegative().optional(),
});
const expectation = z.strictObject({
  "student-compilation": z.enum(["success", "failure"]).optional(),
  job: z.enum(["complete", "failure"]).optional(),
  "required-tests": z.literal("all-pass").optional(),
  classification: text.optional(),
  "failed-tests": count.optional(),
  "executed-tests": count.optional(),
  "test-ids": z.array(text).optional(),
  score: z.strictObject({
    "less-than": z.number().nonnegative().optional(),
    "at-least": z.number().nonnegative().optional(),
    exactly: z.number().nonnegative().optional(),
  }).optional(),
});
export const NativeSourceProfileSchema = z.strictObject({
  mode: z.enum(["implementation", "student-tests"]),
  root: path,
  include: strings.min(1),
});
const fields = {
  runtime: text,
  "source-profile": text,
  tests: strings,
  java: z.strictObject({
    release: integer,
    encoding: text.optional(),
    "compiler-options": z.array(z.string()).max(128).optional(),
  }).optional(),
  limits: z.strictObject({
    "outer-seconds": positive.optional(),
    "compile-seconds": positive.optional(),
    "run-seconds": positive.optional(),
    networking: z.literal(false).optional(),
    "max-output-bytes": integer.optional(),
  }).optional(),
  feedback: z.strictObject({ requirement: text, "what-check": text })
    .optional(),
  "public-cases": z.array(
    z.strictObject({
      id: text,
      name: text,
      test: text,
      input: text.optional(),
      state: text.optional(),
      action: text.optional(),
      expected: text,
    }).refine(
      (c) =>
        c.input !== undefined || c.state !== undefined ||
        c.action !== undefined,
      "public case requires input/state/action",
    ),
  ).max(32).optional(),
  scoring: z.discriminatedUnion("mode", [
    z.strictObject({ mode: z.literal("weighted") }),
    z.strictObject({ mode: z.literal("all-pass") }),
    z.strictObject({
      mode: z.literal("contract-groups"),
      groups: z.array(
        z.strictObject({
          id: text,
          weight: positive,
          tests: z.array(text).min(1),
        }),
      ).min(1),
    }),
    z.strictObject({
      mode: z.literal("threshold"),
      basis: z.enum(["score", "passed-tests"]),
      value: z.number().nonnegative().finite(),
    }),
  ]),
  references: z.array(
    z.strictObject({ name: text, root: path, optional: z.boolean() }),
  ).max(256).optional(),
  "verification-tests": strings.optional(),
  "contract-cases": path.optional(),
  "verification-expectations": z.strictObject({
    reference: expectation.optional(),
    starter: expectation.optional(),
  }).optional(),
  discovery: z.strictObject({
    "min-executed": integer.optional(),
    "allow-skipped": z.boolean().optional(),
  }).optional(),
  variants: z.strictObject({
    correct: z.array(text).min(1),
    mutants: z.array(text).min(1),
  }).optional(),
  "java-build": z.strictObject({
    kind: z.literal("gradle-jar-v1"),
    "main-class": text.regex(
      /^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/,
    ).optional(),
    artifact: text.regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,100}\.jar$/),
  }).optional(),
  "additional-java-sources": z.strictObject({
    "primary-required": z.boolean().optional(),
    archive: text.regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,100}\.zip$/),
    "max-files": integer.max(128),
    "max-file-bytes": integer.max(1048576),
    "max-total-bytes": integer.max(4194304),
    "max-archive-bytes": integer.max(2097152),
  }).optional(),
  "api-precheck": api.optional(),
  "verification-api-precheck": api.optional(),
};
export const NativeProjectCheckSchema = z.strictObject({
  ...fields,
  profile: text,
  sourceProfile: NativeSourceProfileSchema,
}).superRefine((c, ctx) => {
  const native = c.runtime === "java25-gradle-junit-v1",
    java = ["java25-junit-v1", "java25-gradle-junit-v1"].includes(c.runtime);
  if (
    native !== Boolean(c["java-build"]) ||
    (c["java-build"] || c["additional-java-sources"] || c["api-precheck"] ||
        c["verification-api-precheck"]) &&
      (!java || c.sourceProfile.mode !== "implementation")
  ) {
    ctx.addIssue({
      code: "custom",
      message:
        "Java Gradle/API/extra sources require explicit implementation policy",
    });
  }
  if (
    new Set(c["public-cases"]?.map((x) => x.id)).size !==
      c["public-cases"]?.length && c["public-cases"]
  ) ctx.addIssue({ code: "custom", message: "Duplicate public case" });
});
export const NativeProjectChecksSchema = z.strictObject({
  defaults: z.strictObject(fields).partial().default({}),
  "source-profiles": z.record(text, NativeSourceProfileSchema),
  profiles: z.record(text, z.strictObject(fields).partial()),
});
/** Только PL policy inheritance. Native metadata inheritance уже выполнил Quarto. */
function merge(base: any, local: any): any {
  if (!local || typeof local !== "object" || Array.isArray(local)) return local;
  const out = { ...base };
  for (const [k, v] of Object.entries(local)) {
    out[k] = v && typeof v === "object" && !Array.isArray(v) && out[k] &&
        typeof out[k] === "object" && !Array.isArray(out[k])
      ? merge(out[k], v)
      : v;
  }
  return out;
}
export function nativeCheckScalars(value: unknown): any {
  const out = structuredClone(value) as any;
  function visit(v: any, key = ""): any {
    if (Array.isArray(v)) return v.map((x) => visit(x, key));
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.entries(v).map(([k, x]) => [k, visit(x, k)]),
      );
    }
    if (
      typeof v === "string" &&
      [
        "release",
        "outer-seconds",
        "compile-seconds",
        "run-seconds",
        "max-output-bytes",
        "weight",
        "value",
        "min-executed",
        "max-files",
        "max-file-bytes",
        "max-total-bytes",
        "max-archive-bytes",
        "at-least",
        "exactly",
        "less-than",
      ].includes(key) && v.trim() !== "" && Number.isFinite(Number(v))
    ) return Number(v);
    return v;
  }
  return visit(out);
}
export function decodeNativeCheck(raw: unknown, profile: string) {
  const config = NativeProjectChecksSchema.parse(nativeCheckScalars(raw));
  if (!Object.hasOwn(config.profiles, profile)) {
    throw Error("PL.PROJECT_CHECK_INVALID: unknown profile " + profile);
  }
  const check = merge(
    { scoring: { mode: "weighted" } },
    merge(config.defaults, config.profiles[profile]),
  );
  const sourceProfile = config["source-profiles"][check["source-profile"]];
  if (!sourceProfile) {
    throw Error("PL.PROJECT_CHECK_INVALID: unknown source profile");
  }
  return NativeProjectCheckSchema.parse({ ...check, profile, sourceProfile });
}
