import { exportPrairieLearn } from "../_extensions/course-prairielearn/application/export.ts";
const assert = (v: unknown, m: string) => {
  if (!v) throw Error(m);
};
const p = () => ({
  schema: "course-body-package-v1",
  owner: "demo",
  release: "native",
  apiVersion: [1, 23, 1],
  questions: [{
    owner: "demo",
    id: "exr-clamp",
    key: "demo/exr-clamp",
    source: "tasks.qmd",
    visibility: "public",
    answerType: "manual",
    condition: [{ t: "Para", c: [{ t: "Str", c: "PUBLIC_CONDITION" }] }],
    publicAnswer: [],
  }],
  works: [{
    owner: "demo",
    id: "sec-lab",
    key: "demo/sec-lab",
    source: "lab.qmd",
    kind: "lab",
    title: "Lab",
    items: ["demo/exr-clamp"],
    requirements: { "exr-clamp": "required" },
  }],
  resources: [],
});
const binding = {
  questions: {
    "exr-clamp": {
      topic: "Java",
      files: ["Clamp.java"],
      externalGradingOptions: {
        image: "docker.io/library/gradle:9.1.0-jdk25",
        entrypoint: ["sh", "/grade/tests/grade.sh"],
        timeout: 30,
      },
    },
  },
};
Deno.test("native PL delivery separates public starter and private tests and keeps stable UUID", async () => {
  const root = await Deno.makeTempDir();
  try {
    for (const directory of ["student", "reference", "tests"]) {
      await Deno.mkdir(root + "/projects/clamp/" + directory, {
        recursive: true,
      });
    }
    await Deno.writeTextFile(
      root + "/projects/clamp/student/Clamp.java",
      "PUBLIC_STARTER",
    );
    await Deno.writeTextFile(
      root + "/projects/clamp/reference/Clamp.java",
      "PRIVATE_REFERENCE",
    );
    await Deno.writeTextFile(
      root + "/projects/clamp/tests/grade.sh",
      "PRIVATE_TESTS",
    );
    const context = {
      projectRoot: root,
      projects: { "exr-clamp": "/projects/clamp" },
    };
    await exportPrairieLearn(p(), context, binding, root + "/output");
    const q = root + "/output/questions/demo/exr-clamp";
    const html = await Deno.readTextFile(q + "/question.html");
    assert(
      html.includes("PUBLIC_CONDITION") && html.includes("pl-file-upload") &&
        !html.includes("PRIVATE"),
      "invalid public question",
    );
    assert(
      await Deno.readTextFile(q + "/clientFilesQuestion/Clamp.java") ===
        "PUBLIC_STARTER",
      "starter missing",
    );
    assert(
      await Deno.readTextFile(q + "/tests/grade.sh") === "PRIVATE_TESTS",
      "tests missing",
    );
    let absent = false;
    try {
      await Deno.stat(q + "/clientFilesQuestion/reference");
    } catch (e) {
      absent = e instanceof Deno.errors.NotFound;
    }
    assert(absent, "reference became public");
    const info = JSON.parse(await Deno.readTextFile(q + "/info.json"));
    assert(
      info.gradingMethod === "External" && !info.partialCredit &&
        info.type === "v3",
      "native info missing",
    );
    const moved = p();
    moved.questions[0].source = "moved.qmd";
    await exportPrairieLearn(moved, context, binding, root + "/second");
    assert(
      JSON.parse(
        await Deno.readTextFile(
          root + "/second/questions/demo/exr-clamp/info.json",
        ),
      ).uuid === info.uuid,
      "UUID depends on physical path",
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
Deno.test("PL rejects missing explicit binding and symlinked public files before output", async () => {
  const root = await Deno.makeTempDir();
  try {
    await Deno.mkdir(root + "/projects/clamp/student", { recursive: true });
    await Deno.mkdir(root + "/projects/clamp/tests");
    await Deno.writeTextFile(root + "/secret", "PRIVATE");
    await Deno.symlink(root + "/secret", root + "/projects/clamp/student/leak");
    for (const b of [{ questions: {} }, binding]) {
      let refused = false;
      try {
        await exportPrairieLearn(
          p(),
          { projectRoot: root, projects: { "exr-clamp": "/projects/clamp" } },
          b,
          root + "/out",
        );
      } catch (e) {
        refused = String(e).includes("ADAPTER");
      }
      assert(refused, "invalid delivery accepted");
      let absent = false;
      try {
        await Deno.stat(root + "/out");
      } catch (e) {
        absent = e instanceof Deno.errors.NotFound;
      }
      assert(absent, "failed delivery wrote output");
    }
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
Deno.test("PL refuses questions outside selected work and protects literal template braces", async () => {
  const root = await Deno.makeTempDir();
  try {
    for (const d of ["student", "tests"]) {
      await Deno.mkdir(root + "/projects/clamp/" + d, { recursive: true });
    }
    await Deno.writeTextFile(
      root + "/projects/clamp/student/Clamp.java",
      "starter",
    );
    await Deno.writeTextFile(root + "/projects/clamp/tests/grade.sh", "tests");
    const context = {
      projectRoot: root,
      projects: { "exr-clamp": "/projects/clamp" },
    };
    const foreign = p();
    foreign.works[0].items = [];
    let rejected = false;
    try {
      await exportPrairieLearn(foreign, context, binding, root + "/invalid");
    } catch (e) {
      rejected = String(e).includes("ADAPTER");
    }
    assert(rejected, "unassigned question exported");
    const literal = p();
    literal.questions[0].condition[0].c[0].c = "Literal {{closed_answer}}";
    await exportPrairieLearn(literal, context, binding, root + "/literal");
    const html = await Deno.readTextFile(
      root + "/literal/questions/demo/exr-clamp/question.html",
    );
    assert(
      !html.includes("{{closed_answer}}") &&
        html.includes("&#123;&#123;closed_answer&#125;&#125;"),
      "authored brace became runtime template",
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

async function projectFixture(root: string) {
  for (const d of ["student", "tests"]) {
    await Deno.mkdir(root + "/projects/clamp/" + d, { recursive: true });
  }
  await Deno.writeTextFile(
    root + "/projects/clamp/student/Clamp.java",
    "starter",
  );
  await Deno.writeTextFile(root + "/projects/clamp/tests/grade.sh", "tests");
  return { projectRoot: root, projects: { "exr-clamp": "/projects/clamp" } };
}
async function noDelivery(root: string) {
  for await (const e of Deno.readDir(root)) {
    assert(
      e.name !== "out" && !e.name.startsWith(".pl-delivery-"),
      "failed export left delivery or staging",
    );
  }
}
Deno.test("ADAPTER binding refusal identifies component, authored question and related work", async () => {
  const root = await Deno.makeTempDir();
  try {
    const bad = structuredClone(binding);
    bad.questions["exr-clamp"].externalGradingOptions.image = "";
    let error: any;
    try {
      await exportPrairieLearn(
        p(),
        await projectFixture(root),
        bad,
        root + "/out",
      );
    } catch (e) {
      error = e;
    }
    assert(
      error?.name === "ExtensionDiagnostic" && error.code === "ADAPTER",
      "binding refusal is not a known own diagnostic",
    );
    for (
      const term of [
        "course-prairielearn",
        "tasks.qmd",
        "exr-clamp",
        "externalGradingOptions",
        "sec-lab",
        "lab.qmd",
        "подсказка",
      ]
    ) {
      assert(error.message.includes(term), "missing author context: " + term);
    }
    await noDelivery(root);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
Deno.test("ADAPTER unsupported body and resource retain question field before output", async () => {
  const root = await Deno.makeTempDir();
  try {
    const context = await projectFixture(root);
    for (
      const [node, field] of [
        [{ t: "RawBlock", c: ["html", "<p>raw</p>"] }, "condition"],
        [
          { t: "Image", c: [["", [], []], [], ["missing.png", ""]] },
          "condition.resource",
        ],
      ] as const
    ) {
      const candidate: any = p();
      candidate.questions[0].condition = [node];
      let error: any;
      try {
        await exportPrairieLearn(candidate, context, binding, root + "/out");
      } catch (e) {
        error = e;
      }
      assert(
        error?.code === "ADAPTER" && error.message.includes("tasks.qmd") &&
          error.message.includes("exr-clamp") && error.message.includes(field),
        "unsupported body lost author context",
      );
      await noDelivery(root);
    }
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
Deno.test("Pandoc command failure preserves tool exit stdout stderr and cause without ADAPTER", async () => {
  const root = await Deno.makeTempDir(), previous = Deno.env.get("QUARTO");
  try {
    const tool = root + "/quarto-failure";
    await Deno.writeTextFile(
      tool,
      "#!/bin/sh\nprintf 'foreign stdout'\nprintf 'PANDOC_FOREIGN: original details' >&2\nexit 17\n",
    );
    await Deno.chmod(tool, 0o755);
    Deno.env.set("QUARTO", tool);
    let error: any;
    try {
      await exportPrairieLearn(
        p(),
        await projectFixture(root),
        binding,
        root + "/out",
      );
    } catch (e) {
      error = e;
    }
    assert(
      error?.name === "ExternalToolFailure" && error.tool === tool &&
        error.exitCode === 17,
      "external command reclassified or exit lost",
    );
    assert(
      error.stdout === "foreign stdout" &&
        error.stderr === "PANDOC_FOREIGN: original details" &&
        error.cause?.code === 17,
      "external streams or cause lost",
    );
    assert(
      !error.message.includes("ADAPTER") &&
        error.message.includes("tasks.qmd") &&
        error.message.includes("exr-clamp"),
      "external failure lacks execution context",
    );
    await noDelivery(root);
  } finally {
    if (previous === undefined) Deno.env.delete("QUARTO");
    else Deno.env.set("QUARTO", previous);
    await Deno.remove(root, { recursive: true });
  }
});
Deno.test("staged filesystem failure removes partial delivery and retains unknown error", async () => {
  const root = await Deno.makeTempDir();
  try {
    const candidate: any = p(), bytes = new TextEncoder().encode("resource");
    const sha256 = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      (x) => x.toString(16).padStart(2, "0"),
    ).join("");
    candidate.resources.push({
      owner: "demo",
      target: "Clamp.java/image.png",
      visibility: "public",
      data: btoa("resource"),
      sha256,
    });
    candidate.questions[0].condition = [{
      t: "Para",
      c: [{ t: "Image", c: [["", [], []], [], ["Clamp.java/image.png", ""]] }],
    }];
    let error: any;
    try {
      await exportPrairieLearn(
        candidate,
        await projectFixture(root),
        binding,
        root + "/out",
      );
    } catch (e) {
      error = e;
    }
    assert(
      error instanceof Error && error.name !== "ExtensionDiagnostic" &&
        !!error.stack,
      "unexpected filesystem error was suppressed",
    );
    await noDelivery(root);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

const cli = new URL(
  "../_extensions/course-prairielearn/entrypoints/export.ts",
  import.meta.url,
).pathname;
async function runCli(args: string[]) {
  const result = await new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "--no-config",
      "--allow-read",
      "--allow-write",
      "--allow-run",
      "--allow-env",
      cli,
      ...args,
    ],
    stdout: "piped",
    stderr: "piped",
  }).output();
  return { ...result, text: new TextDecoder().decode(result.stderr) };
}
Deno.test("CLI formats known input refusal once without stack", async () => {
  const result = await runCli([]);
  assert(
    !result.success && result.text.split("PL.INPUT_INVALID").length === 2 &&
      result.text.includes("course-prairielearn") &&
      !result.text.includes("at file://"),
    "CLI input diagnostic missing, repeated or stack printed",
  );
});
Deno.test("CLI preserves foreign Core diagnostic and unknown stack", async () => {
  const root = await Deno.makeTempDir();
  try {
    const core = root + "/bank/_extensions/course-core/body-export";
    await Deno.mkdir(core, { recursive: true });
    await Deno.writeTextFile(
      core + "/producer.ts",
      "export function buildBodies() {}\n",
    );
    for (
      const [source, known] of [
        [
          'const cause = new Error("CUE original cause"); cause.name = "ExternalToolFailure"; const e = new Error("CORE.SELECTED_WORK: work.qmd sec-lab", {cause}); e.name = "ExtensionDiagnostic"; throw e;',
          true,
        ],
        [
          'const cause = new Error("CUE original cause"); cause.name = "ExternalToolFailure"; const e = new Error("CORE.SELECTED_WORK: work.qmd sec-lab\\nCUE original cause", {cause}); e.name = "ExtensionDiagnostic"; throw e;',
          true,
        ],
        ['throw new Error("unexpected internal export fault");', false],
      ] as const
    ) {
      await Deno.writeTextFile(
        core + "/collect.ts",
        "export function collectExport() {" + source + "}\n",
      );
      const result = await runCli([
        root,
        "bank",
        "sec-lab",
        "binding.json",
        root + "/out",
      ]);
      assert(!result.success, "failed Core export returned success");
      if (known) {
        assert(
          result.text.split("CORE.SELECTED_WORK").length === 2 &&
            !result.text.includes("at file://") &&
            !result.text.includes("ADAPTER") &&
            result.text.split("CUE original cause").length === 2,
          "Core diagnostic or foreign cause recoded, suppressed, repeated or stack printed",
        );
      } else {assert(
          result.text.includes("unexpected internal export fault") &&
            result.text.includes("collect.ts:"),
          "unknown Core stack suppressed",
        );}
      await noDelivery(root);
    }
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
Deno.test("ADAPTER invalid resource encoding keeps original cause and resource field", async () => {
  const root = await Deno.makeTempDir();
  try {
    const candidate: any = p();
    candidate.resources = [{
      owner: "demo",
      target: "image.png",
      visibility: "public",
      data: "!",
      sha256: "unused",
    }];
    candidate.questions[0].condition = [{
      t: "Para",
      c: [{ t: "Image", c: [["", [], []], [], ["image.png", ""]] }],
    }];
    let error: any;
    try {
      await exportPrairieLearn(
        candidate,
        await projectFixture(root),
        binding,
        root + "/out",
      );
    } catch (e) {
      error = e;
    }
    assert(
      error?.code === "ADAPTER" && error.message.includes("exr-clamp") &&
        error.message.includes("resources.data") &&
        error.cause instanceof Error,
      "resource diagnostic suppressed encoding cause or author context",
    );
    await noDelivery(root);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
