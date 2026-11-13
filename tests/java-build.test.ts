import { required } from "./fixture-values.ts";
import {
  type NativeProjectCheck,
  NativeProjectCheckSchema,
} from "../_extensions/course-prairielearn/application/native-checks.ts";
import { runtimeDescriptor } from "../_extensions/course-prairielearn/application/runtime-descriptor.ts";
const assert = (v: unknown, m: string) => {
  if (!v) throw Error(m);
};
const build: NonNullable<NativeProjectCheck["java-build"]> = {
  kind: "gradle-jar-v1",
  "main-class": "grade.Main",
  artifact: "gradeapp.jar",
};
const check = NativeProjectCheckSchema.parse({
  profile: "fixture",
  "source-profile": "main",
  tests: ["tests/**"],
  scoring: { mode: "weighted" },
  runtime: "java25-gradle-junit-v1",
  sourceProfile: {
    mode: "implementation",
    root: "student/src/main/java",
    include: ["**/*.java"],
  },
  "java-build": build,
});
const profile = { mode: "implementation", javaRelease: 25 };
function rejected(fn: () => unknown) {
  let denied = false;
  try {
    fn();
  } catch {
    denied = true;
  }
  assert(denied, "invalid native build descriptor accepted");
}
Deno.test(
  "native Gradle descriptor carries closed build record and preserves independent Java API/extras",
  () => {
    const value = runtimeDescriptor(
      {
        ...check,
        "api-precheck": { files: ["tests/Api.java"], entry: "grade.Api" },
        "additional-java-sources": {
          archive: "extra.zip",
          "max-files": 1,
          "max-file-bytes": 100,
          "max-total-bytes": 100,
          "max-archive-bytes": 100,
        },
      },
      profile,
      ["grade/Main.java"],
      ["Api.java", "Checks.java"],
      { files: ["Api.java"], entry: "grade.Api" },
    );
    assert(
      JSON.stringify(value.javaBuild) ===
        JSON.stringify({
          kind: "gradle-jar-v1",
          mainClass: "grade.Main",
          artifact: "gradeapp.jar",
        }),
      "descriptor dropped or changed javaBuild",
    );
    assert(
      value.apiPrecheck?.entry === "grade.Api" &&
        value.additionalJavaSources?.archive === "extra.zip",
      "native Java API/extras lost",
    );
    assert(
      JSON.stringify(value.sourceFiles) === '["grade/Main.java"]' &&
        JSON.stringify(value.testFiles) === '["Api.java","Checks.java"]',
      "build changed source/test selection",
    );
  },
);
Deno.test(
  "native Gradle descriptors fail closed on absent records unknown recipes fields names runtime and mutation",
  () => {
    for (const patch of [
      { "java-build": undefined },
      { "java-build": null },
      { "java-build": { ...build, command: "run" } },
      { "java-build": { ...build, kind: "unknown" } },
      { runtime: "java25-junit-v1" },
      { runtime: "java25-junit-mutation-v1" },
      { runtime: "fish-git-v1" },
      { sourceProfile: { ...check.sourceProfile, mode: "student-tests" } },
    ]) {
      const raw: unknown = { ...check, ...patch };
      // Намеренно неверный raw приходит через внешнюю JS-границу; результат не используется.
      rejected(() => {
        Reflect.apply(runtimeDescriptor, undefined, [
          raw,
          profile,
          ["Main.java"],
          ["Checks.java"],
        ]);
      });
    }
    for (const artifact of [
      "../x.jar",
      "/x.jar",
      ".hidden.jar",
      "x/y.jar",
      "x\\y.jar",
      "C:x.jar",
      "x*.jar",
      "x?.jar",
      "x..jar",
      "x.zip",
      "a".repeat(102) + ".jar",
      "x\n.jar",
    ]) {
      rejected(() =>
        runtimeDescriptor(
          {
            ...check,
            "java-build": { ...build, artifact },
          },
          profile,
          ["Main.java"],
          ["Checks.java"],
        ),
      );
    }
    for (const main of [
      "grade..Main",
      ".Main",
      "grade.Main.",
      "9Main",
      "grade/Main",
      "grade.Main\n",
    ]) {
      rejected(() =>
        runtimeDescriptor(
          {
            ...check,
            "java-build": { ...build, "main-class": main },
          },
          profile,
          ["Main.java"],
          ["Checks.java"],
        ),
      );
    }
    for (const p of [
      { mode: "implementation", sourceExtensions: [".fish"] },
      { mode: "student-tests", javaRelease: 25 },
      { mode: "implementation", javaRelease: 21 },
      {
        mode: "implementation",
        javaRelease: 25,
        sourceExtensions: [".java", ".gradle"],
      },
    ])
      rejected(() =>
        runtimeDescriptor(check, p, ["Main.java"], ["Checks.java"]),
      );
    const legacy = runtimeDescriptor(
      { ...check, runtime: "java25-junit-v1", "java-build": undefined },
      profile,
      ["Main.java"],
      ["Checks.java"],
    );
    assert(!("javaBuild" in legacy), "plain Java acquired native build");
    const fish = runtimeDescriptor(
      { ...check, runtime: "fish-git-v1", "java-build": undefined },
      { sourceExtensions: [".fish"] },
      ["main.fish"],
      ["checks.py"],
    );
    assert(
      !("javaBuild" in fish) && !("java" in fish),
      "fish acquired Java build",
    );
  },
);
Deno.test(
  "Java API capability accepts only the two explicit implementation runtimes",
  () => {
    const api = { files: ["Api.java"], entry: "Api" };
    const c = {
      ...check,
      "java-build": undefined,
      runtime: "custom-java-v1",
      "api-precheck": { files: ["tests/Api.java"], entry: "Api" },
    };
    rejected(() =>
      runtimeDescriptor(
        c,
        profile,
        ["Main.java"],
        ["Api.java", "Checks.java"],
        api,
      ),
    );
    const plain = runtimeDescriptor(
      NativeProjectCheckSchema.parse({ ...c, runtime: "java25-junit-v1" }),
      profile,
      ["Main.java"],
      ["Api.java", "Checks.java"],
      api,
    );
    assert(
      plain.apiPrecheck?.entry === "Api",
      "plain Java API capability lost",
    );
  },
);

Deno.test(
  "optional-primary policy preserves absent bytes and validates both typed values",
  () => {
    const extra = {
      archive: "extra.zip",
      "max-files": 128,
      "max-file-bytes": 1048576,
      "max-total-bytes": 4194304,
      "max-archive-bytes": 2097152,
    };
    const plain = runtimeDescriptor(
      { ...check, "additional-java-sources": extra },
      profile,
      ["Main.java"],
      ["Checks.java"],
    );
    assert(
      !("primaryRequired" in required(plain.additionalJavaSources)),
      "legacy descriptor acquired field",
    );
    for (const value of [false, true]) {
      const descriptor = runtimeDescriptor(
        {
          ...check,
          "additional-java-sources": { ...extra, "primary-required": value },
        },
        profile,
        ["Main.java"],
        ["Checks.java"],
      );
      assert(
        required(descriptor.additionalJavaSources).primaryRequired === value,
        "primaryRequired translation lost",
      );
    }
    for (const value of [0, 1, "false", null, undefined, []]) {
      const raw: unknown = {
        ...check,
        "additional-java-sources": { ...extra, "primary-required": value },
      };
      // Намеренно неверный raw приходит через внешнюю JS-границу; результат не используется.
      rejected(() => {
        Reflect.apply(runtimeDescriptor, undefined, [
          raw,
          profile,
          ["Main.java"],
          ["Checks.java"],
        ]);
      });
    }
  },
);

Deno.test(
  "native library Gradle descriptor omits mainClass and rejects bad present values",
  () => {
    const library = NativeProjectCheckSchema.parse({
      ...check,
      "java-build": { kind: "gradle-jar-v1", artifact: "library.jar" },
    });
    const result = runtimeDescriptor(
      library,
      profile,
      ["Book.java"],
      ["Api.java", "Checks.java"],
    );
    assert(
      JSON.stringify(result.javaBuild) ===
        JSON.stringify({ kind: "gradle-jar-v1", artifact: "library.jar" }),
      "library requires fictitious mainClass",
    );
    for (const value of [null, "", false, 5, "bad;Main"]) {
      const raw: unknown = {
        ...library,
        "java-build": { ...library["java-build"], "main-class": value },
      };
      // Намеренно неверный raw приходит через внешнюю JS-границу; результат не используется.
      rejected(() => {
        Reflect.apply(runtimeDescriptor, undefined, [
          raw,
          profile,
          ["Book.java"],
          ["Checks.java"],
        ]);
      });
    }
  },
);

Deno.test(
  "ZIP фиксированного проекта сохраняет закрытый состав исходников",
  () => {
    const parsed = NativeProjectCheckSchema.parse({
      ...check,
      "additional-java-sources": {
        "primary-required": true,
        "allow-additional": false,
        archive: "solution.zip",
        "max-files": 128,
        "max-file-bytes": 1048576,
        "max-total-bytes": 4194304,
        "max-archive-bytes": 2097152,
      },
    });
    const descriptor = runtimeDescriptor(
      parsed,
      profile,
      ["grade/Main.java", "grade/Student.java", "grade/Reports.java"],
      ["Check.java"],
    );
    assert(
      descriptor.additionalJavaSources?.allowAdditional === false &&
        descriptor.additionalJavaSources.primaryRequired === true,
      "ZIP расширил допустимый состав ответа",
    );
  },
);
