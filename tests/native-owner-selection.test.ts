import * as Entry from "../_extensions/course-prairielearn/application/native-entry.ts";
const owner = () => ({
  dir: "/owner",
  quarto: { version: "1.11.5" },
  config: { assessment: { id: "inherited-only" } },
  files: { input: ["/owner/labs/other-name.qmd", "/owner/slides.qmd"] },
  fileInformation: {
    "labs/other-name.qmd": { metadata: { assessment: { id: "sec-lab" } } },
    "slides.qmd": { metadata: { assessment: { id: "sec-slides" } } },
  },
});
Deno.test("C использует observed frontmatter ID, а не basename или inherited metadata", async () => {
  const selected = await (Entry as any).selectNativeOwnerAssignments(owner(), {
    root: "/owner",
    book: "tasks",
    work: "sec-lab",
  });
  if (
    JSON.stringify(selected.assessments) !==
      JSON.stringify([{ source: "labs/other-name.qmd", id: "sec-lab" }]) ||
    selected.expectedSources.length !== 2
  ) throw Error("source binding/owner coverage lost");
  for (
    const mutate of [
      (v: any) =>
        delete v.fileInformation["labs/other-name.qmd"].metadata.assessment,
      (v: any) =>
        v.fileInformation["slides.qmd"].metadata.assessment.id = "sec-lab",
      (v: any) => v.files.input.push("/foreign/escape.qmd"),
      (v: any) => v.files.input.push(v.files.input[0]),
    ]
  ) {
    const bad = owner();
    mutate(bad);
    let refused = false;
    try {
      await (Entry as any).selectNativeOwnerAssignments(bad, {
        root: "/owner",
        book: "tasks",
        work: "sec-lab",
      });
    } catch {
      refused = true;
    }
    if (!refused) throw Error("ambiguous/missing/foreign source accepted");
  }
});
Deno.test("consume existing отказывает до новой scope или чтения owner", async () => {
  let error = "";
  try {
    await Entry.nativeEntry(
      { root: "/nonexistent-owner", book: "tasks", mode: "existing" } as any,
    );
  } catch (e) {
    error = String(e);
  }
  if (!error.includes("PL.NATIVE_CONSUME_UNSUPPORTED")) {
    throw Error("existing mode entered fresh path: " + error);
  }
});

Deno.test("course intent включает observed context меню, standalone остаётся exact work", async () => {
  const observed: any = owner();
  observed.config.prairielearn = {
    "question-defaults": {
      topic: "Fixture",
      grading: { method: "manual" },
      submission: { mode: "upload" },
      "single-variant": true,
    },
    delivery: {
      book: "tasks",
      course: {
        name: "FIXTURE",
        title: "Проверка",
        timezone: "Europe/Minsk",
        topics: [{ name: "Fixture", color: "blue2", description: "Проверка" }],
      },
      instances: {
        pilot: {
          title: "Проверка",
          "self-enrollment": false,
          publishing: {
            "start-date": "1970-01-01T00:00:00Z",
            "end-date": "9999-12-31T00:00:00Z",
          },
          works: ["sec-lab"],
        },
      },
    },
  };
  const selected: any = await Entry.selectNativeOwnerAssignments(observed, {
    root: "/owner",
    book: "tasks",
    instance: "pilot",
  });
  if (
    JSON.stringify(selected.contextAssessments) !==
      JSON.stringify([{ source: "slides.qmd", id: "sec-slides" }])
  ) throw Error("native menu context omitted before child");
});
