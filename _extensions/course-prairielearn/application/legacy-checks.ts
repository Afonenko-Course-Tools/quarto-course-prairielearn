// Статические consumer views прежних полей; runtime qualification остаётся у existing guards.
import type { NativeProjectCheck } from "./native-checks.ts";
import type { nativeRawSourceSelection } from "./native-check-inventory.ts";
import type { NativeProjectFact } from "course-core/public.ts";

export interface LegacyPhysicalSelection {
  projectRelativePath: string;
  submissionRelativePath: string;
  sha256: string;
}
export type NativeSourceOrigin = Awaited<
  ReturnType<typeof nativeRawSourceSelection>
>;
export type CheckSourceOrigin = LegacyPhysicalSelection | NativeSourceOrigin;

/** Legacy не объявлял source-profile/tests и допускает inferred string/boolean literals.
 * Закрытые Java/API/feedback guards остаются в прежних consumer functions. */
export type LegacyDescriptorCheck =
  & Omit<
    Partial<NativeProjectCheck>,
    "runtime" | "sourceProfile" | "scoring" | "limits" | "java-build"
  >
  & {
    runtime: string;
    sourceProfile: { mode: string; root?: string; include?: string[] };
    scoring?: { mode: string };
    limits?: Omit<NonNullable<NativeProjectCheck["limits"]>, "networking"> & {
      networking?: boolean;
    };
    "java-build"?: { kind: string; artifact: string; "main-class"?: string };
  };
export type ExportCheckProject =
  & Pick<NativeProjectFact, "exerciseId" | "bankMember" | "projectRoot">
  & {
    check?: LegacyDescriptorCheck & {
      profile: string;
      sourceProfile: LegacyDescriptorCheck["sourceProfile"] & { root: string };
      scoring: { mode: string };
    };
    sources: readonly CheckSourceOrigin[];
    trustedTests: readonly CheckSourceOrigin[];
    readiness?: { ready: boolean };
    apiPrecheck?: NativeProjectCheck["api-precheck"];
  };
export interface ExportChecks {
  bookRoot: string;
  sourceSnapshotHash: string;
  inventoryHash: string;
  projects: readonly ExportCheckProject[];
}
