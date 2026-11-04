import { Buffer } from "node:buffer";
import type { NativeProjectCheck } from "./native-checks.ts";
import type { NativeProjectFact } from "course-core/public.ts";
export type SelectedCheckFile = { name: string; target: string; data: string };
export type NativeCheckProject =
  & Pick<
    NativeProjectFact,
    "exerciseId" | "source" | "bankMember" | "projectRoot"
  >
  & {
    qualifiedId: string;
    check: NativeProjectCheck;
    sources: SelectedCheckFile[];
    trustedTests: SelectedCheckFile[];
    verificationTests: SelectedCheckFile[];
    references: {
      name: string;
      root: string;
      optional: boolean;
      group: string;
      available: boolean;
      targets: string[];
      sources: SelectedCheckFile[];
    }[];
    contractFixtures: SelectedCheckFile[];
    contractCases?: SelectedCheckFile;
    apiPrecheck?: { files: string[]; entry: string };
    verificationApiPrecheck?: { files: string[]; entry: string };
    readiness: { ready: boolean; missing: string[] };
  };
export type NativeCourseChecks = {
  schemaVersion: 3;
  courseId: string;
  bookRoot: string;
  projects: readonly NativeCheckProject[];
};
export function selectedCheckFile(
  file: { target: string; bytes: Uint8Array },
  name: string,
): SelectedCheckFile {
  return {
    name,
    target: file.target,
    data: Buffer.from(file.bytes).toString("base64"),
  };
}
export function nativeChecksManifest(
  input: {
    courseId: string;
    bookRoot: string;
    projects: readonly NativeCheckProject[];
  },
): NativeCourseChecks {
  const projects = [...input.projects].sort((a, b) =>
    a.qualifiedId.localeCompare(b.qualifiedId)
  );
  if (new Set(projects.map((p) => p.qualifiedId)).size !== projects.length) {
    throw Error("PL.CHECKS_INVALID: duplicate question");
  }
  return {
    schemaVersion: 3,
    courseId: input.courseId,
    bookRoot: input.bookRoot,
    projects,
  };
}
