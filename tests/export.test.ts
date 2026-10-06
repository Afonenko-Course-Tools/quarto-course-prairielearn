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
