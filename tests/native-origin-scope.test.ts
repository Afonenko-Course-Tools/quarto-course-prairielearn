import {
  assertNativeChecksCoverage,
  authoredNativeSettings,
} from "../_extensions/course-prairielearn/application/native-course.ts";
import {
  checksCanonical,
  legacyChecksProject,
  nativeChecksManifest,
} from "../_extensions/course-prairielearn/application/native-check-inventory.ts";
import { hash } from "../_extensions/course-prairielearn/application/source-selection.ts";
const sources = [{ source: "bank.qmd", sha256: "a".repeat(64) }];
const project = {
  source: "bank.qmd",
  exerciseId: "exr-p",
  qualifiedId: "native/exr-p",
  selectionOriginVersion: 2,
  nativePlanGroups: ["example"],
  references: [{
    name: "lawful",
    root: "author/example/src/main/java",
    optional: false,
    available: true,
    group: "example",
    targets: ["author/example/src/main/java/Main.java"],
    sources: [],
  }],
  contractFixtures: [],
  check: { profile: "native" },
};
const scope = {
  schema: "pl-native-selected-checks-v1",
  identity: {
    operation: "12345678-1234-4123-8123-123456789abc",
    runtime: "quarto-1.11.5",
    projection: "author",
    profiles: ["full"],
  },
  assessments: [{ source: "bank.qmd", id: "sec-work" }],
  sources,
  automaticIds: ["native/exr-p"],
};
Deno.test("native scope binds intent separately and preserves established hash area", async () => {
  const first = await nativeChecksManifest({
    courseId: "native",
    bookRoot: "tasks",
    sources,
    projects: [project],
    version: 2,
    selectionScope: scope,
  });
  const second = await nativeChecksManifest({
    courseId: "native",
    bookRoot: "tasks",
    sources,
    projects: [project],
    version: 2,
    selectionScope: {
      ...scope,
      assessments: [...scope.assessments, {
        source: "bank.qmd",
        id: "sec-second",
      }],
    },
  });
  if (
    first.selectionScopeHash === second.selectionScopeHash ||
    first.inventoryHash !== second.inventoryHash ||
    first.sourceSnapshotHash !== second.sourceSnapshotHash
  ) throw Error("selected intent changed established hashes");
  const projects = [legacyChecksProject(project)];
  if (
    first.inventoryHash !== await hash(checksCanonical(projects)) ||
    first.sourceSnapshotHash !==
      await hash(checksCanonical({ sources, projects }))
  ) throw Error("wrong hash projection");
  for (
    const automaticIds of [[], ["native/exr-extra"], [
      "native/exr-p",
      "native/exr-p",
    ]]
  ) {
    let error = "";
    try {
      await nativeChecksManifest({
        courseId: "native",
        bookRoot: "tasks",
        sources,
        projects: [project],
        version: 2,
        selectionScope: { ...scope, automaticIds },
      });
    } catch (e) {
      error = String(e);
    }
    if (!error) {
      throw Error("scope accepted missing/extra/duplicate automatic IDs");
    }
  }
});
Deno.test("all captured checks including hidden/nonPL must be covered before checks-output", () => {
  const witness = {
    projects: [{
      source: "bank.qmd",
      fact: { exerciseId: "exr-p", check: {}, bankMember: true },
    }, {
      source: "hidden.qmd",
      fact: {
        exerciseId: "exr-hidden",
        check: {},
        bankMember: false,
        target: "manual",
      },
    }],
  };
  let error = "";
  try {
    assertNativeChecksCoverage(witness, [project]);
  } catch (e) {
    error = String(e);
  }
  if (!error.includes("hidden.qmd")) {
    throw Error("unselected hidden check omitted");
  }
  assertNativeChecksCoverage(witness, [project, {
    source: "hidden.qmd",
    exerciseId: "exr-hidden",
  }]);
});
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
  const body = { apiVersion: [1, 23, 1], resources: [] },
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
  const bad = structuredClone(nodes);
  (bad[0] as any).c[0].c[1][0].c[2][0] = "#missing";
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
