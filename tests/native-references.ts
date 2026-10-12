import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { exportPrairieLearn } from "../_extensions/course-prairielearn/application/export.ts";
const core = await Deno.realPath(Deno.args[0]),
  repo = Deno.cwd(),
  root = await Deno.makeTempDir({ prefix: "pl-native-references-" });
const { collectExport } = await import(
  pathToFileURL(join(core, "_extensions/course-core/body-export/collect.ts"))
    .href
);
const { buildBodies } = await import(
  pathToFileURL(join(core, "_extensions/course-core/body-export/producer.ts"))
    .href
);
const assert = (v: unknown, m: string) => {
  if (!v) throw Error(m);
};
try {
  for (const owner of [core, repo]) {
    const r = await new Deno.Command(Deno.env.get("QUARTO") || "quarto", {
      args: ["add", owner, "--no-prompt"],
      cwd: root,
      stdout: "piped",
      stderr: "piped",
    }).output();
    assert(r.success, new TextDecoder().decode(r.stderr));
  }
  await Deno.writeTextFile(
    join(root, "_quarto.yml"),
    "project:\n  type: book\n  pre-render: _extensions/course-core/entrypoints/pre.ts\n  post-render: _extensions/course-core/entrypoints/post.ts\nbook:\n  title: References\n  chapters: [index.qmd]\nformat: html\nfilters: [course-core, course-prairielearn]\ncourse: {id: native-refs, adapters: [prairielearn]}\nbibliography: refs.bib\nlink-citations: true\n",
  );
  await Deno.writeTextFile(
    join(root, "refs.bib"),
    "@book{public, title={NATIVE_PUBLIC_ATTRIBUTION}, year={2024}, url={https://example.org/public}}\n@book{private, title={PRIVATE_ATTRIBUTION}, year={2023}}",
  );
  await Deno.writeTextFile(
    join(root, "index.qmd"),
    '---\nexercise-bank: true\nexercise-statement-visibility: open\nassessment: {kind: lab, id: references}\n---\n# References\n\n::: {#exr-one target=prairielearn difficulty=introductory time=1 project="/projects/demo"}\n## Native question\n\nNative [@public]. See @sec-local.\n\n### Local section {#sec-local}\n\n::: {.grading-notes}\nSecret [@private].\n:::\n:::\n\n::: {.task-items stage=homework}\n1. @exr-one\n:::\n',
  );
  await Deno.mkdir(join(root, "projects/demo/student"), { recursive: true });
  await Deno.mkdir(join(root, "projects/demo/tests"), { recursive: true });
  await Deno.writeTextFile(
    join(root, "projects/demo/student/Main.java"),
    "PUBLIC_STARTER",
  );
  await Deno.writeTextFile(
    join(root, "projects/demo/tests/grade.sh"),
    "PRIVATE_TESTS",
  );
  const selected = await collectExport(root, { book: ".", work: "references" });
  const { publicPackage } = await buildBodies(selected.result, {
    projectRoot: root,
    courseId: "native-refs",
    work: "references",
  });
  await exportPrairieLearn(publicPackage, {
    projectRoot: root,
    projects: { "exr-one": "/projects/demo" },
  }, {
    questions: {
      "exr-one": {
        topic: "Java",
        files: ["Main.java"],
        externalGradingOptions: {
          image: "docker.io/library/gradle:9.1.0-jdk25",
          entrypoint: ["sh", "/grade/tests/grade.sh"],
          timeout: 30,
        },
      },
    },
  }, join(root, "out"));
  const html = await Deno.readTextFile(
    join(root, "out/questions/native-refs/exr-one/question.html"),
  );
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]),
    links = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
  assert(
    html.includes("NATIVE_PUBLIC_ATTRIBUTION") &&
      html.includes("https://example.org/public") &&
      !html.includes("PRIVATE_ATTRIBUTION"),
    "native public bibliography changed or leaks private source",
  );
  assert(
    links.length === 2 && links.every((id) => ids.includes(id)) &&
      new Set(ids).size === ids.length,
    "native bibliography/Header links have missing or duplicate targets",
  );
  assert(
    ids.every((id) => id.startsWith("pl-")),
    "question IDs not namespaced",
  );
  console.log(
    "PASS installed Core native bibliography/section crossref → namespaced standalone PrairieLearn HTML",
  );
} finally {
  await Deno.remove(root, { recursive: true });
}
