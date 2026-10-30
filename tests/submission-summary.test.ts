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
        "explanation.md",
        ".pl-seed/identity.json",
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
