import { required } from "./fixture-values.ts";
import { NativeProjectCheckSchema } from "../_extensions/course-prairielearn/application/native-checks.ts";
import { runtimeDescriptor } from "../_extensions/course-prairielearn/application/runtime-descriptor.ts";
const assert = (value: unknown) => {
  if (!value) throw new Error("Assertion failed");
};
Deno.test("fish descriptor does not impersonate Java; Java keeps compiler defaults", () => {
  const check = NativeProjectCheckSchema.parse({
    profile: "fixture",
    "source-profile": "main",
    tests: ["tests/**"],
    scoring: { mode: "weighted" },
    runtime: "fish-git-v1",
    sourceProfile: {
      mode: "implementation",
      root: "student",
      include: ["**/*.fish"],
    },
  });
  const descriptor = runtimeDescriptor(check, { sourceExtensions: [".fish"] }, [
    "commands.fish",
  ], ["headers.txt"]);
  assert(
    !Object.hasOwn(descriptor, "java") &&
      descriptor.sourceFiles[0] === "commands.fish",
  );
  const java = runtimeDescriptor(
    { ...check, runtime: "java25-junit-v1" },
    { javaRelease: 25 },
    ["S.java"],
    ["T.java"],
  );
  assert(java.java?.release === 25 && java.java.encoding === "UTF-8");
});
import * as Core from "course-core/public.ts";
import { selectNativeCompilerInputs } from "../_extensions/course-prairielearn/application/native-selection.ts";
import type { ProjectPlan } from "course-core/public.ts";
Deno.test("текстовый ответ требует явное расширение среды и сохраняет настоящее имя", async () => {
  const plan = (audience: "student" | "full"): ProjectPlan => ({
    id: crypto.randomUUID(),
    input: "projects/fish",
    audience,
    testsets: ["checks"],
    components: [],
    groups: [],
  });
  const file = (
    audience: "student" | "full",
    target: string,
    reason: string,
  ) => ({
    audience,
    target,
    reason,
    bytes: new TextEncoder().encode("echo example\n"),
  });
  const check = NativeProjectCheckSchema.parse({
    profile: "fish",
    "source-profile": "main",
    runtime: "fish-git-v1",
    sourceProfile: {
      root: "student",
      mode: "implementation",
      include: ["**/*.fish"],
    },
    tests: ["tests/**"],
    scoring: { mode: "weighted" },
  });
  const input = {
    core: Core,
    check,
    studentPlan: plan("student"),
    fullPlan: plan("full"),
    student: {
      exerciseId: "exr-fish",
      audience: "student",
      files: [file("student", "student/commands.fish", "starter")],
    },
    full: {
      exerciseId: "exr-fish",
      audience: "full",
      files: [file("full", "tests/headers.txt", "testset:checks")],
    },
    runtimeProfile: { sourceExtensions: [".fish"] },
  };
  const selected = await selectNativeCompilerInputs(input);
  assert(required(selected.sources[0]).name === "commands.fish");
  for (
    const runtimeProfile of [
      {},
      { sourceExtensions: [".java"] },
      { sourceExtensions: [] },
      { sourceExtensions: ["fish"] },
      { sourceExtensions: [".fish"], javaRelease: 25 },
    ]
  ) {
    let denied = false;
    try {
      await selectNativeCompilerInputs({ ...input, runtimeProfile });
    } catch {
      denied = true;
    }
    assert(denied);
  }
});
