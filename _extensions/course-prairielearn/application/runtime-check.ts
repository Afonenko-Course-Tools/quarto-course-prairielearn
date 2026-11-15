import type { NativeProjectCheck } from "./native-checks.ts";
export type RuntimeCheckInput = Omit<
  Partial<NativeProjectCheck>,
  "runtime" | "sourceProfile" | "scoring" | "limits" | "java-build"
> & {
  runtime: string;
  sourceProfile: { mode: string; root?: string; include?: string[] };
  scoring?: { mode: string } | undefined;
  limits?:
    | (Omit<NonNullable<NativeProjectCheck["limits"]>, "networking"> & {
        networking?: boolean | undefined;
      })
    | undefined;
  "java-build"?:
    | { kind: string; artifact: string; "main-class"?: string | undefined }
    | undefined;
};
