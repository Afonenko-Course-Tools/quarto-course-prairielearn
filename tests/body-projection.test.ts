import { renderPublicBody } from "../_extensions/course-prairielearn/application/export.ts";
Deno.test("native body omits bibliographic nodes and preserves code brackets and useful author links", async () => {
  const nodes: any[] = [{
    t: "Para",
    c: [
      { t: "Str", c: "PUBLIC_WORDS" },
      { t: "Space" },
      {
        t: "Cite",
        c: [[{
          citationId: "book",
          citationPrefix: [],
          citationSuffix: [],
          citationMode: { t: "NormalCitation" },
          citationNoteNum: 0,
          citationHash: 0,
        }], [{ t: "Str", c: "BIBLIOGRAPHIC_ONLY" }]],
      },
      { t: "Space" },
      { t: "Code", c: [["", [], []], "array[i]"] },
      { t: "Space" },
      { t: "Str", c: "[literal]" },
      { t: "Space" },
      {
        t: "Link",
        c: [["", [], []], [{ t: "Str", c: "AUTHOR_LINK" }], [
          "https://example.org/guide",
          "",
        ]],
      },
    ],
  }, {
    t: "Div",
    c: [["refs", ["references", "csl-bib-body"], []], [{
      t: "Para",
      c: [{ t: "Str", c: "BIBLIOGRAPHY_BLOCK" }],
    }]],
  }];
  const before = JSON.stringify(nodes),
    result = await renderPublicBody(
      { owner: "fixture", apiVersion: [1, 23, 1], resources: [] },
      nodes,
      "fixture/exr-test",
      { owner: "fixture", id: "exr-test" } as any,
      "resources",
      "{{options.client_files_question_url}}",
    );
  if (
    result.html.includes("BIBLIOGRAPH") ||
    ![
      "PUBLIC_WORDS",
      "array[i]",
      "[literal]",
      "AUTHOR_LINK",
      "https://example.org/guide",
    ].every((s) => result.html.includes(s))
  ) throw Error("Native bibliographic projection changed useful condition");
  if (JSON.stringify(nodes) !== before) {
    throw Error("Projection mutated canonical authored AST");
  }
});

Deno.test("public body resource rewrites preserve query and fragment on one verified physical target", async () => {
  const { renderPublicBody } = await import(
    "../_extensions/course-prairielearn/application/export.ts"
  );
  const { hash } = await import(
    "../_extensions/course-prairielearn/application/source-selection.ts"
  );
  const p = {
    owner: "fixture",
    apiVersion: [1, 23, 1],
    resources: [{
      owner: "fixture",
      source: "work.qmd",
      effectiveBase: "/fixture",
      target: "diagram.svg",
      visibility: "public",
      data: btoa("<svg/>"),
      sha256: await hash("<svg/>"),
    }],
  };
  const ast = [{
    t: "Para",
    c: [{
      t: "Image",
      c: [["", [], []], [{ t: "Str", c: "Схема" }], [
        "diagram.svg?cache=one#node",
        "",
      ]],
    }, {
      t: "Link",
      c: [["", [], []], [{ t: "Str", c: "Источник" }], [
        "diagram.svg?download=1#source",
        "",
      ]],
    }],
  }];
  const result = await renderPublicBody(
    p,
    ast,
    "fixture/exr-body",
    { source: "work.qmd", id: "exr-body" },
    "clientFilesCourse",
    "{{ client_files_course }}",
  );
  if (
    !result.html.includes(
      "{{ client_files_course }}/diagram.svg?cache=one#node",
    ) ||
    !result.html.includes(
      "{{ client_files_course }}/diagram.svg?download=1#source",
    ) || result.files.length !== 1 ||
    result.files[0].name !== "clientFilesCourse/diagram.svg"
  ) throw Error("resource suffix lost or fake target emitted");
});
