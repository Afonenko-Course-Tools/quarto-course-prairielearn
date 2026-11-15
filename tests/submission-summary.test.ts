import { required } from "./fixture-values.ts";
function assert(v: unknown, m: string): asserts v {
  if (!v) throw Error(m);
}
Deno.test(
  "публичный PL summary сохраняет логическое имя и отдельный путь starter",
  async () => {
    const api = await import("../_extensions/course-prairielearn/public.ts");
    assert(
      typeof api.describeSubmission === "function",
      "Нет публичного describeSubmission",
    );
    const value = api.describeSubmission({ mode: "upload" }, [
      {
        name: "grade/Main.java",
        starterPath: "src/main/java/grade/Main.java",
      },
    ]);
    assert(
      required(value.files[0], "submission file").name === "grade/Main.java" &&
        required(value.files[0], "submission file").starterPath ===
          "src/main/java/grade/Main.java",
      "Mapping заменён basename",
    );
    assert(
      typeof value.instructions === "string" && value.instructions.length > 0,
      "Нет инструкции README",
    );
    let rejected = false;
    try {
      api.describeSubmission({ mode: "upload" }, [
        {
          name: "../Main.java",
          starterPath: "src/Main.java",
        },
      ]);
    } catch {
      rejected = true;
    }
    assert(rejected, "Небезопасный logical path передан Core");
  },
);
Deno.test(
  "Workspace summary описывает native сдачу без вымышленного файла",
  async () => {
    const api = await import("../_extensions/course-prairielearn/public.ts");
    assert(
      typeof api.describeSubmission === "function",
      "Нет публичного describeSubmission",
    );
    const value = api.describeSubmission(
      {
        mode: "workspace",
        workspaceOptions: {
          image: "ghcr.io/example/ws@sha256:" + "a".repeat(64),
          home: "/home/coder/workspace",
          port: 8080,
          gradedFiles: [
            "work/**",
            "work/.git/**",
            "work/.*",
            "explanation.m[d]",
            ".pl-seed/identity.jso[n]",
          ],
        },
      },
      [],
    );
    assert(
      value.files.length === 0 && value.instructions.includes("PrairieLearn"),
      "Native summary выдумывает upload filename",
    );
    assert(
      !Object.hasOwn(value, "mode") &&
        !Object.hasOwn(value, "workspaceOptions"),
      "PL бизнес-данные продублированы в Core envelope",
    );
  },
);

import { describeSubmission } from "../_extensions/course-prairielearn/application/submission.ts";

Deno.test(
  "README Java описывает один способ ответа по выбранным исходникам",
  () => {
    for (const primaryRequired of [false, true]) {
      for (const test of [
        { names: ["Example.java"], wanted: "редакторы", forbidden: "ZIP" },
        {
          names: ["a/Study.java", "b/Value.java"],
          wanted: "редакторы",
          forbidden: "ZIP",
        },
        {
          names: ["A.java", "B.java", "C.java"],
          wanted: "исходные файлы",
          forbidden: "ZIP",
        },
        {
          names: ["a/Study.java", "a/Value.java", "b/Key.java"],
          wanted: "ZIP",
          forbidden: "отдельные",
        },
      ]) {
        const result = describeSubmission(
          { mode: "upload", layout: "files-or-zip" },
          test.names.map((name) => ({ name })),
          { freeComposition: true, primaryRequired, archive: "solution.zip" },
        );
        assert(
          result.instructions.includes(test.wanted) &&
            !result.instructions.includes(test.forbidden),
          "README предлагает другой или смешанный способ ответа",
        );
        assert(
          !result.instructions.includes("очистите"),
          "README требует очистку для ZIP",
        );
      }
    }
  },
);
