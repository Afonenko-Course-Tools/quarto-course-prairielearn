import { NativeProjectCheckSchema } from "../_extensions/course-prairielearn/application/native-checks.ts";
import { runtimeDescriptor } from "../_extensions/course-prairielearn/application/runtime-descriptor.ts";
const assert = (value: unknown, message: string) => {
  if (!value) throw Error(message);
};

Deno.test("public descriptions belong to ordinary Body, not project-check DSL", () => {
  const policy = {
    profile: "fixture",
    "source-profile": "main",
    tests: ["tests/**"],
    scoring: { mode: "weighted" },
    runtime: "java25-junit-v1",
    sourceProfile: {
      mode: "implementation",
      root: "student",
      include: ["**/*.java"],
    },
  };
  const legacy = [{
    id: "normal",
    name: "Открытый пример",
    test: "Checks#normal",
    input: "2 3",
    expected: "5",
  }];
  assert(
    !NativeProjectCheckSchema.safeParse({ ...policy, "public-cases": legacy })
      .success,
    "removed public-cases DSL still accepted",
  );
  const result = runtimeDescriptor(
    NativeProjectCheckSchema.parse(policy),
    { javaRelease: 25 },
    ["Calculator.java"],
    ["Checks.java"],
  );
  assert(
    !("publicCases" in result),
    "runtime still exports a second public description format",
  );
});

Deno.test("author feedback descriptions are rejected and never projected into runtime metadata", () => {
  const policy = {
    profile: "fixture",
    "source-profile": "main",
    tests: ["tests/**"],
    scoring: { mode: "weighted" },
    runtime: "java25-junit-v1",
    sourceProfile: {
      mode: "implementation",
      root: "student",
      include: ["**/*.java"],
    },
    feedback: {
      requirement: "Открытое требование",
      "what-check": "Обычное описание проверки",
    },
  };
  assert(
    !NativeProjectCheckSchema.safeParse(policy).success,
    "removed author feedback DSL still accepted",
  );
  const result = runtimeDescriptor(policy, { javaRelease: 25 }, [
    "Calculator.java",
  ], ["Checks.java"]);
  assert(
    !("feedback" in result) && !("publicCases" in result),
    "author descriptions still projected into runtime metadata",
  );
});
