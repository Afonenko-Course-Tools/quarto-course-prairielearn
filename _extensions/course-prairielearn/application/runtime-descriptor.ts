import { createMetrics as __createMetrics } from "../observability/bridge.ts";
const __metrics = __createMetrics("course-prairielearn");
import { normalizeDiscovery } from "./grading-descriptor.ts";
import { javaBuild } from "./java-build.ts";
import { safePath } from "./source-selection.ts";
import type { RuntimeCheckInput } from "./runtime-check.ts";
export type RuntimeProfile = NonNullable<Parameters<typeof javaBuild>[1]>;
export interface AdditionalJavaSources {
  primaryRequired?: boolean;
  allowAdditional?: boolean;
  archive: string;
  maxFiles: number;
  maxFileBytes: number;
  maxTotalBytes: number;
  maxArchiveBytes: number;
}
export function validateAdditionalJavaSources(
  value: unknown,
  sources: string[],
  tests: string[],
): AdditionalJavaSources {
  const caps = {
    maxFiles: 128,
    maxFileBytes: 1048576,
    maxTotalBytes: 4194304,
    maxArchiveBytes: 2097152,
  };
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("PL invalid additional Java sources policy");
  const cap = (key: keyof typeof caps): number => {
    const n: unknown = Reflect.get(value, key);
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > caps[key])
      throw new Error("PL invalid additional Java sources policy");
    return n;
  };
  const archive: unknown = Reflect.get(value, "archive");
  const primaryRequired: unknown = Reflect.get(value, "primaryRequired");
  const allowAdditional: unknown = Reflect.get(value, "allowAdditional");
  if (
    Object.keys(value).some(
      (k) =>
        ![
          "archive",
          "primaryRequired",
          "allowAdditional",
          ...Object.keys(caps),
        ].includes(k),
    ) ||
    ("primaryRequired" in value && typeof primaryRequired !== "boolean") ||
    ("allowAdditional" in value && typeof allowAdditional !== "boolean") ||
    typeof archive !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9_-]{0,100}\.zip$/.test(archive)
  )
    throw new Error("PL invalid additional Java sources policy");
  if (
    [...sources, ...tests, "grading-job.json", "tests/grading-job.json"].some(
      (name) =>
        name === archive ||
        name.startsWith(archive + "/") ||
        archive.startsWith(name + "/"),
    )
  )
    throw new Error(
      "PL additional Java archive conflicts with primary/trusted path",
    );
  return {
    archive,
    maxFiles: cap("maxFiles"),
    maxFileBytes: cap("maxFileBytes"),
    maxTotalBytes: cap("maxTotalBytes"),
    maxArchiveBytes: cap("maxArchiveBytes"),
    ...(typeof primaryRequired === "boolean" ? { primaryRequired } : {}),
    ...(typeof allowAdditional === "boolean" ? { allowAdditional } : {}),
  };
}
export interface ApiPrecheck {
  files: string[];
  entry: string;
}
function additionalSources(
  c: RuntimeCheckInput,
  sources: string[],
  tests: string[],
): AdditionalJavaSources | undefined {
  const extra = c["additional-java-sources"];

  if (extra !== undefined) {
    if (
      !extra ||
      typeof extra !== "object" ||
      Array.isArray(extra) ||
      !["java25-junit-v1", "java25-gradle-junit-v1"].includes(c.runtime) ||
      c.sourceProfile.mode !== "implementation" ||
      Object.keys(extra).some(
        (k) =>
          ![
            "archive",
            "max-files",
            "max-file-bytes",
            "max-total-bytes",
            "max-archive-bytes",
            "primary-required",
            "allow-additional",
          ].includes(k),
      )
    ) {
      throw new Error(
        "PL additional Java sources require closed Java implementation policy",
      );
    }
    return validateAdditionalJavaSources(
      {
        ...("primary-required" in extra
          ? { primaryRequired: extra["primary-required"] }
          : {}),
        ...("allow-additional" in extra
          ? { allowAdditional: extra["allow-additional"] }
          : {}),
        archive: extra.archive,
        maxFiles: extra["max-files"],
        maxFileBytes: extra["max-file-bytes"],
        maxTotalBytes: extra["max-total-bytes"],
        maxArchiveBytes: extra["max-archive-bytes"],
      },
      sources,
      tests,
    );
  }
  return undefined;
}
function runtimeDescriptorImplementation<C extends RuntimeCheckInput>(
  c: C,
  profile: RuntimeProfile,
  sources: string[],
  tests: string[],
  api?: ApiPrecheck,
) {
  const build = javaBuild(c, profile);
  const javaRuntime =
    profile.javaRelease !== undefined || !profile.sourceExtensions;
  if (!javaRuntime && c.java !== undefined)
    throw new Error(
      "PL non-Java runtime cannot declare Java compiler settings",
    );
  if (Boolean(c["api-precheck"]) !== Boolean(api))
    throw new Error("PL API precheck selection missing or undeclared");
  if (
    api &&
    (!["java25-junit-v1", "java25-gradle-junit-v1"].includes(c.runtime) ||
      !javaRuntime ||
      c.sourceProfile.mode !== "implementation" ||
      !Array.isArray(api.files) ||
      !api.files.length ||
      new Set(api.files).size !== api.files.length ||
      api.files.length >= tests.length ||
      api.files.some(
        (x) => !safePath(x) || !x.endsWith(".java") || !tests.includes(x),
      ) ||
      !/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(api.entry) ||
      api.entry !== c["api-precheck"]?.entry)
  )
    throw new Error("PL API precheck must be a proper trusted Java subset");
  const additionalJavaSources = additionalSources(c, sources, tests);
  const mode: C["sourceProfile"]["mode"] = c.sourceProfile.mode;
  const field = <K extends keyof C>(key: K): C[K] => c[key];
  const scoring = field("scoring");
  return {
    schemaVersion: 1,
    sourceFiles: sources,
    testFiles: tests,
    mode,
    runtime: c.runtime,
    ...(javaRuntime
      ? {
          java: {
            release: 25,
            encoding: "UTF-8",
            "compiler-options": ["-proc:none", "-Xmaxerrs", "5"],
            ...c.java,
          },
        }
      : {}),
    limits: {
      "outer-seconds": 30,
      "compile-seconds": 15,
      "run-seconds": 10,
      networking: false,
      "max-output-bytes": 65536,
      ...c.limits,
    },
    scoring: scoring ?? ({ mode: "weighted" } satisfies { mode: "weighted" }),
    discovery: normalizeDiscovery(c.discovery),
    ...(c.variants ? { variants: c.variants } : {}),
    ...(additionalJavaSources ? { additionalJavaSources } : {}),
    ...(build ? { javaBuild: build } : {}),
    ...(api
      ? { apiPrecheck: { files: [...api.files], entry: api.entry } }
      : {}),
  };
}

export const runtimeDescriptor = __metrics.wrapSync(
  {
    id: "course-prairielearn.application.runtime-descriptor.runtimeDescriptor",
    kind: "phase",
  },
  runtimeDescriptorImplementation,
);
