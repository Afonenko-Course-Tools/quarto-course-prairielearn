import { required } from "./fixture-values.ts";
import {
  nativeChecksManifest,
  selectedCheckFile,
} from "../_extensions/course-prairielearn/application/native-check-inventory.ts";
import type { NativeCheckProject } from "../_extensions/course-prairielearn/application/native-check-inventory.ts";
import { NativeProjectCheckSchema } from "../_extensions/course-prairielearn/application/native-checks.ts";
const check = NativeProjectCheckSchema.parse({
  profile: "java",
  "source-profile": "main",
  runtime: "java25-junit-v1",
  sourceProfile: {
    mode: "implementation",
    root: "src",
    include: ["**/*.java"],
  },
  tests: ["tests/**"],
  scoring: { mode: "weighted" },
});
const project = (id: string): NativeCheckProject => ({
  exerciseId: id,
  qualifiedId: "course/" + id,
  source: "work.qmd",
  projectRoot: "projects/" + id,
  bankMember: true,
  check,
  sources: [
    selectedCheckFile({
      target: "src/Study.java",
      bytes: new TextEncoder().encode("class Study {}"),
    }, "Study.java"),
  ],
  trustedTests: [
    selectedCheckFile({
      target: "tests/Check.java",
      bytes: new TextEncoder().encode("class Check {}"),
    }, "tests/Check.java"),
  ],
  verificationTests: [],
  references: [],
  contractFixtures: [],
  readiness: { ready: true, missing: [] },
});
Deno.test("selected v3 сохраняет содержимое и детерминированный порядок проектов", () => {
  const a = project("exr-a"), b = project("exr-b");
  const result = nativeChecksManifest({
    courseId: "course",
    bookRoot: "tasks",
    projects: [b, a],
  });
  if (
    result.schemaVersion !== 3 || result.projects[0] !== a ||
    result.projects[1] !== b ||
    required(result.projects[0].sources[0]).name !== "Study.java" ||
    !required(result.projects[0].trustedTests[0]).data
  ) throw Error("functional selected data lost");
  if (
    Object.keys(result).sort().join(",") !==
      "bookRoot,courseId,projects,schemaVersion"
  ) throw Error("selected contract includes obsolete proof fields");
});
Deno.test("selected v3 отклоняет неоднозначный ID вопроса", () => {
  let denied = false;
  try {
    nativeChecksManifest({
      courseId: "course",
      bookRoot: "tasks",
      projects: [project("exr-a"), project("exr-a")],
    });
  } catch {
    denied = true;
  }
  if (!denied) throw Error("duplicate question accepted");
});
