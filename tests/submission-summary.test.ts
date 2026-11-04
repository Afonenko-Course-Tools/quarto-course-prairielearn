function assert(v: unknown, m: string): asserts v {
  if (!v) throw Error(m);
}
Deno.test("публичный PL summary сохраняет логическое имя и отдельный путь starter", async () => {
  const api: Record<string, any> = await import(
    "../_extensions/course-prairielearn/public.ts"
  ).catch(() => ({}));
  assert(
    typeof api.describeSubmission === "function",
    "Нет публичного describeSubmission",
  );
  const value = api.describeSubmission({ mode: "upload" }, [{
    name: "grade/Main.java",
    starterPath: "src/main/java/grade/Main.java",
  }]);
  assert(
    value.files[0].name === "grade/Main.java" &&
      value.files[0].starterPath === "src/main/java/grade/Main.java",
    "Mapping заменён basename",
  );
  assert(
    typeof value.instructions === "string" && value.instructions.length > 0,
    "Нет инструкции README",
  );
  let rejected = false;
  try {
    api.describeSubmission({ mode: "upload" }, [{
      name: "../Main.java",
      starterPath: "src/Main.java",
    }]);
  } catch {
    rejected = true;
  }
  assert(rejected, "Небезопасный logical path передан Core");
});
Deno.test("Workspace summary описывает native сдачу без вымышленного файла", async () => {
  const api: Record<string, any> = await import(
    "../_extensions/course-prairielearn/public.ts"
  ).catch(() => ({}));
  assert(
    typeof api.describeSubmission === "function",
    "Нет публичного describeSubmission",
  );
  const value = api.describeSubmission({
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
  }, []);
  assert(
    value.files.length === 0 && value.instructions.includes("PrairieLearn"),
    "Native summary выдумывает upload filename",
  );
  assert(
    !Object.hasOwn(value, "mode") && !Object.hasOwn(value, "workspaceOptions"),
    "PL бизнес-данные продублированы в Core envelope",
  );
});

import { describeSubmission } from "../_extensions/course-prairielearn/application/submission.ts";
Deno.test("README различает фиксированные вложенные пути и свободный ответ", () => {
  const nested = ["grade/Main.java", "grade/Student.java", "model/Key.java"].map((name) => ({ name, starterPath: "src/main/java/" + name }));
  const zip = describeSubmission({ mode: "upload" }, nested, { archive: "solution.zip" });
  assert(zip.instructions.includes("ZIP") && zip.instructions.includes("относительные пути"), "README предлагает невозможную загрузку путей по одному");
  const free = describeSubmission({ mode: "upload" }, [{ name: "Example.java" }], { freeComposition: true, archive: "additional-sources.zip" });
  assert(free.instructions.includes("свободен") && free.instructions.includes("отдельные") && free.instructions.includes("ZIP"), "README превратил пример стартера в обязательный ответ");
});

Deno.test("README сохраняет обязательные исходники при разрешённых вспомогательных классах", () => {
  const value = describeSubmission({ mode: "upload" }, [{ name: "Book.java" }], {
    freeComposition: true, primaryRequired: true, archive: "solution.zip",
  });
  assert(value.instructions.includes("обязательны") && !value.instructions.includes("не становятся обязательными"),
    "README объявляет обязательный API лишь примером");
  assert(value.instructions.includes("отдельные") && value.instructions.includes("ZIP"), "README запретил helpers");
});

Deno.test("README сохраняет обязательный ZIP при дополнительных исходниках", () => {
  const files = ["qpack/ICharQ.java", "qpack/FixedQueue.java", "qpack/Test.java"].map(name => ({ name }));
  const value = describeSubmission({ mode: "upload", layout: "zip" }, files, { freeComposition: true, primaryRequired: true, archive: "solution.zip" });
  assert(value.instructions.startsWith("Загрузите ZIP") && !value.instructions.includes("отдельные"), "README разрешил плоскую загрузку обязательной структуры");
});
