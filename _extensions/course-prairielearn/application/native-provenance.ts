import type {
  NativeAssignmentProvenance,
  NativeProjectFact,
} from "course-core/public.ts";
import type { NativeProjectCheck } from "./native-checks.ts";
import {
  decodeNativeCheck,
  nativeCheck,
  parseNativeChecks,
} from "./native-checks.ts";
import { safePath } from "./source-selection.ts";
/** PL policy принадлежит C. Core передаёт selector и raw plane из той же
 * preprojection capture, включая скрытые/non-PL проекты. Никакого IO/authority. */
export function normalizeNativeProjectFact(
  value: NativeProjectFact,
  projectChecks: unknown,
): Omit<NativeProjectFact, "projectCheck"> & {
  check?: NativeProjectCheck;
} {
  const { projectCheck, ...fact } = structuredClone(value);
  if (projectCheck === undefined) {
    return fact;
  }
  if (typeof projectCheck !== "string" || !projectCheck) {
    throw Error("PL.CHECKS_CHANGED: invalid check selector");
  }
  const check = decodeNativeCheck(projectChecks, projectCheck);
  return { ...fact, check };
}
/** Typed факты той же Core callback уже проверены validateRelease.
 * Здесь остаются PL policy и безопасные owner-relative project paths; без IO authority. */
export function nativeProjectRows(value: NativeAssignmentProvenance) {
  return value.documents.flatMap((doc) => {
    // A raw map is owned by this exact source, never shared across documents.
    const checks = doc.projects.some(
      (project) => project.projectCheck !== undefined,
    )
      ? parseNativeChecks(doc.projectChecks)
      : undefined;
    return doc.projects.map((generic) => {
      const { projectCheck, ...rest } = structuredClone(generic);
      if (
        projectCheck !== undefined &&
        (typeof projectCheck !== "string" || !projectCheck)
      ) {
        throw Error("PL.CHECKS_CHANGED: invalid check selector");
      }
      let fact: ReturnType<typeof normalizeNativeProjectFact> = rest;
      if (projectCheck !== undefined) {
        if (!checks)
          throw Error("PL.PROJECT_CHECK_INVALID: project checks required");
        fact = { ...rest, check: nativeCheck(checks, projectCheck) };
      }
      if (!safePath(fact.projectRoot)) {
        throw Error("PL.PROJECT_INVALID: требуется owner-relative project");
      }
      return {
        source: doc.source,
        format: doc.format,
        fact,
        materialization: fact.materialization,
      };
    });
  });
}
