// Реальные legacy accepted fields и native producer проходят один consumer без forced parse.
import { runtimeDescriptor } from "../_extensions/course-prairielearn/application/runtime-descriptor.ts";
import { nativeChecksManifest } from "../_extensions/course-prairielearn/application/native-check-inventory.ts";
import type { NativeProjectCheck } from "../_extensions/course-prairielearn/application/native-checks.ts";
import type { projectNativeChecks } from "../_extensions/course-prairielearn/application/native-check-projection.ts";
import type {
  CheckSourceOrigin,
  ExportChecks,
  LegacyDescriptorCheck,
  LegacyPhysicalSelection,
  NativeSourceOrigin,
} from "../_extensions/course-prairielearn/application/legacy-checks.ts";

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
const accepted: LegacyDescriptorCheck = legacy;
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
type Project = Awaited<ReturnType<typeof projectNativeChecks>>["project"];
type Manifest = Awaited<ReturnType<typeof nativeChecksManifest<Project>>>;
type _Project = Require<Exact<Manifest["projects"][number], Project>>;
declare const manifest: Manifest;
const checks: ExportChecks = manifest;
void checks;

declare const nativeOrigin: NativeSourceOrigin;
declare const physical: LegacyPhysicalSelection;
const nativeFile: CheckSourceOrigin = nativeOrigin;
const legacyFile: CheckSourceOrigin = physical;
void nativeFile;
void legacyFile;
type _OriginHash = Require<Exact<CheckSourceOrigin["sha256"], string>>;
type _PhysicalPath = Require<
  Exact<LegacyPhysicalSelection["projectRelativePath"], string>
>;
