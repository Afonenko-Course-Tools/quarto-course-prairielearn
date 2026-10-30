import { posix } from "node:path";
// @deno-types="../vendor/zod/v4/index.d.ts"
import { z } from "../vendor/zod/v4/index.js";
import { safePath } from "./source-selection.ts";
const path = z.string().min(1).max(4096).refine(safePath).refine((p) =>
  !p.split("/").some((s) =>
    [".git", ".quarto", "_generated", "node_modules"].includes(s)
  )
);
const common = z.strictObject({
  source: z.string().min(1).max(4096).refine((p) =>
    !/[\\\0]/.test(p) && !/^\w+:/.test(p)
  ),
  target: path,
  audience: z.enum(["student", "grading"]),
}).superRefine((c, ctx) => {
  if (
    c.audience === "student"
      ? !c.target.startsWith("student/") || !safePath(c.target.slice(8))
      : c.target.startsWith("student/")
  ) {
    ctx.addIssue({
      code: "custom",
      message: "Common target должен сохранять явную аудиторию",
    });
  }
});
export const NativeMaterializationSchema = z.strictObject({
  projects: z.record(
    z.string().regex(/^exr-[a-z0-9-]+$/),
    z.strictObject({
      "include-git": z.boolean().optional(),
      "common-files": z.array(common).max(4096).default([]),
    }),
  ),
});

/** Quarto уже rebases source paths к native document; C возвращает свой owner-relative canon. */
export function decodeNativeMaterialization(value: unknown, source?: string) {
  const result = NativeMaterializationSchema.parse(value);
  for (const declaration of Object.values(result.projects)) {
    for (const common of declaration["common-files"]) {
      if (source) {
        common.source = posix.normalize(
          common.source.startsWith("/")
            ? common.source.slice(1)
            : posix.join(posix.dirname(source), common.source),
        );
      }
      if (
        !safePath(common.source) ||
        common.source.split("/").some((s) =>
          [".git", ".quarto", "_generated", "node_modules"].includes(s)
        )
      ) {
        throw Error("PL.MATERIALIZATION_INVALID: common source containment");
      }
    }
  }
  return result;
}
