// Реальные legacy accepted fields и native producer проходят один consumer без forced parse.
import { runtimeDescriptor } from "../_extensions/course-prairielearn/application/runtime-descriptor.ts";
import { nativeChecksManifest } from "../_extensions/course-prairielearn/application/native-check-inventory.ts";
import type { NativeProjectCheck } from "../_extensions/course-prairielearn/application/native-checks.ts";
import type { projectNativeChecks } from "../_extensions/course-prairielearn/application/native-check-projection.ts";
import type { RuntimeCheckInput } from "../_extensions/course-prairielearn/application/runtime-check.ts";
import type {
  NativeCourseChecks,
  SelectedCheckFile,
} from "../_extensions/course-prairielearn/application/native-check-inventory.ts";

type IsAny<T> = 0 extends (1 & T) ? true : false;
type Exact<A, B> = IsAny<A> extends true ? false
  : IsAny<B> extends true ? false
  : [A, B] extends [B, A] ? true
  : false;
type Require<T extends true> = T;

// Та же короткая форма check, что в existing legacy export fixture; без source-profile/tests.
const legacy = {
  profile: "java",
  runtime: "junit",
  sourceProfile: {
    root: "student/src/main/java",
    mode: "implementation",
    include: ["**/*.java"],
  },
  java: { release: 25, encoding: "UTF-8", "compiler-options": ["-proc:none"] },
  limits: { "outer-seconds": 30, networking: false, "max-output-bytes": 65536 },
  scoring: { mode: "weighted" },
  discovery: { "min-executed": 1, "allow-skipped": false },
};
const accepted: RuntimeCheckInput = legacy;
const legacyDescriptor = runtimeDescriptor(legacy, { javaRelease: 25 }, [
  "Main.java",
], ["Checks.java"]);
void accepted;
void legacyDescriptor;

declare const native: NativeProjectCheck;
const nativeDescriptor = runtimeDescriptor(native, { javaRelease: 25 }, [], []);
type _NativeMode = Require<
  Exact<
    typeof nativeDescriptor["mode"],
    NativeProjectCheck["sourceProfile"]["mode"]
  >
>;
type _NativeScoring = Require<
  Exact<typeof nativeDescriptor["scoring"], NativeProjectCheck["scoring"]>
>;
type Project = Awaited<ReturnType<typeof projectNativeChecks>>["project"];
declare const project: Project;
const manifest: NativeCourseChecks = nativeChecksManifest({
  courseId: "fixture",
  bookRoot: "tasks",
  projects: [project],
});
void manifest;
type _SelectedBytes = Require<Exact<SelectedCheckFile["data"], string>>;
type _SelectedFields = Require<
  Exact<keyof SelectedCheckFile, "name" | "target" | "data">
>;
