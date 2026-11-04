import { authoredNativeSettings } from "../_extensions/course-prairielearn/application/native-course.ts";
Deno.test("normalized private settings return exact authored boundary names", () => {
  const value = authoredNativeSettings({
    topic: "Java",
    grading: { method: "external" },
    singleVariant: false,
    submission: { mode: "editor", aceMode: "ace/mode/java" },
  });
  if (
    value.grading !== "external" || value["single-variant"] !== false ||
    value.submission["ace-mode"] !== "ace/mode/java" ||
    "aceMode" in value.submission
  ) throw Error("authored projection differs");
});

import { renderPublicBody } from "../_extensions/course-prairielearn/application/export.ts";
Deno.test("native late bibliography keeps guarded semantic targets and legacy projection unchanged", async () => {
  const nodes = [{
    t: "Para",
    c: [{
      t: "Cite",
      c: [[], [{
        t: "Link",
        c: [["", [], []], [{ t: "Str", c: "[1]" }], ["#ref-safe", ""]],
      }]],
    }],
  }, {
    t: "Div",
    c: [["refs", ["references", "csl-bib-body"], []], [{
      t: "Div",
      c: [["ref-safe", ["csl-entry"], []], [{
        t: "Para",
        c: [{ t: "Str", c: "PUBLIC_BIBLIOGRAPHY" }],
      }]],
    }]],
  }];
  const body = { owner: "native", apiVersion: [1, 23, 1], resources: [] },
    context = { source: "bank.qmd", id: "exr-p", field: "condition" };
  const actual = await renderPublicBody(
    body,
    nodes,
    "native/exr-p",
    context,
    "clientFiles",
    "{{ client }}",
    { preserveBibliography: true },
  );
  if (
    !actual.html.includes("PUBLIC_BIBLIOGRAPHY") ||
    !actual.html.includes("[1]") || !actual.html.includes('href="#pl-')
  ) throw Error("late public citation/bibliography lost");
  const old = await renderPublicBody(
    body,
    nodes,
    "native/exr-p",
    context,
    "clientFiles",
    "{{ client }}",
  );
  if (old.html.includes("PUBLIC_BIBLIOGRAPHY")) {
    throw Error("legacy projection changed");
  }
  const bad = [{
    t: "Para",
    c: [{
      t: "Cite",
      c: [[], [{
        t: "Link",
        c: [["", [], []], [{ t: "Str", c: "[1]" }], ["#missing", ""]],
      }]],
    }],
  }];
  let error = "";
  try {
    await renderPublicBody(
      body,
      bad,
      "native/exr-p",
      context,
      "clientFiles",
      "{{ client }}",
      { preserveBibliography: true },
    );
  } catch (e) {
    error = String(e);
  }
  if (!error) throw Error("dangling bibliography link accepted");
});
