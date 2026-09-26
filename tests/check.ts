import { dirname, fromFileUrl, join, resolve } from "stdlib/path";

const root = dirname(dirname(fromFileUrl(import.meta.url)));
const core = resolve(Deno.args[0] ?? "_extensions/course-core");
const adapter = join(root, "_extensions/course-prairielearn");
const quarto = Deno.env.get("QUARTO") || "quarto";
const cue = Deno.env.get("CUE") || "cue";
const directory = await Deno.makeTempDir({ prefix: "course-pl-policy-" });
const decoder = new TextDecoder();

async function copy(source: string, destination: string): Promise<void> {
  await Deno.mkdir(destination, { recursive: true });
  for await (const entry of Deno.readDir(source)) {
    const input = join(source, entry.name), output = join(destination, entry.name);
    if (entry.isDirectory) await copy(input, output);
    else if (entry.isFile) await Deno.copyFile(input, output);
  }
}

async function command(executable: string, args: string[]) {
  const result = await new Deno.Command(executable, {
    args, cwd: directory, stdout: "piped", stderr: "piped",
  }).output();
  return { ok: result.success, text: decoder.decode(result.stdout) + decoder.decode(result.stderr) };
}

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function document(policy = ""): string {
  return `---
assessment:
  kind: test
${policy}---

# Контрольная {#sec-policy}

${["experiment", "tests", "implementation"].map((id) => `:::: {#exr-${id} target="prairielearn" project="/projects/example"}
## ${id}

Описание задания.
::::`).join("\n\n")}

::: {.assessment-items}
1. @exr-experiment
2. @exr-tests
3. @exr-implementation
:::
`;
}

const policy = `  prairielearn:
    attempts: 3
    pass:
      at-least: 2
    assignment:
      student-label: essay-decoding
`;

try {
  await copy(core, join(directory, "_extensions/course-core"));
  await copy(adapter, join(directory, "_extensions/course-prairielearn"));
  await Deno.mkdir(join(directory, "projects/example"), { recursive: true });
  await Deno.writeTextFile(join(directory, "_quarto.yml"), `project:
  type: default
  render: [index.qmd]
format: html
course:
  schema: "1.0"
  id: policy-test
  validate: true
filters: [course-core, course-prairielearn]
`);

  await Deno.writeTextFile(join(directory, "index.qmd"), document(policy));
  let result = await command(quarto, ["render", "--fail-if-warnings"]);
  assert(result.ok, `Valid QMD must render and validate:\n${result.text}`);
  const modelPath = join(directory, "_generated/course-spec/course.json");
  const valid = JSON.parse(await Deno.readTextFile(modelPath));
  const extracted = valid.assessments[0].extensions.prairielearn;
  assert(extracted.attempts === 3 && extracted.pass["at-least"] === 2 &&
    extracted.assignment["student-label"] === "essay-decoding" && Object.keys(extracted).length === 3,
    "The extracted assessment policy must retain numeric fields and assignment");
  assert(valid.exercises.every((e: { extensions: unknown }) =>
    JSON.stringify(e.extensions) === JSON.stringify({ prairielearn: { grading: "external" } })),
    "Existing exercise payloads must remain unchanged");
  console.log("PASS QMD extraction: 3 questions, 2 required, 3 attempts");

  const cases: [string, (model: typeof valid) => void][] = [
    ["zero attempts", m => { m.assessments[0].extensions.prairielearn.attempts = 0; }],
    ["fractional attempts", m => { m.assessments[0].extensions.prairielearn.attempts = 1.5; }],
    ["nonnumeric attempts", m => { m.assessments[0].extensions.prairielearn.attempts = "many"; }],
    ["zero threshold", m => { m.assessments[0].extensions.prairielearn.pass["at-least"] = 0; }],
    ["fractional threshold", m => { m.assessments[0].extensions.prairielearn.pass["at-least"] = 1.5; }],
    ["threshold exceeds members", m => { m.assessments[0].extensions.prairielearn.pass["at-least"] = 4; }],
    ["missing field", m => { delete m.assessments[0].extensions.prairielearn.attempts; }],
    ["unknown field", m => { m.assessments[0].extensions.prairielearn.attemps = 3; }],
    ["unknown nested field", m => { m.assessments[0].extensions.prairielearn.pass.extra = true; }],
    ["invalid label", m => { m.assessments[0].extensions.prairielearn.assignment["student-label"] = ""; }],
    ["boolean policy", m => { m.assessments[0].extensions.prairielearn = false; }],
    ["manual member", m => { m.exercises[0].target = "manual"; m.exercises[0].extensions = {}; }],
  ];
  for (const [name, mutate] of cases) {
    const model = structuredClone(valid);
    mutate(model);
    await Deno.writeTextFile(join(directory, "candidate.json"), JSON.stringify(model));
    result = await command(cue, ["vet", join(core, "spec/core.cue"),
      join(adapter, "spec/prairielearn.cue"), "candidate.json", "-d", "#Course", "-c"]);
    assert(!result.ok, `Invalid case must fail: ${name}`);
    console.log(`PASS rejected ${name}`);
  }

  // Unknown keys must survive QMD extraction so CUE, not silent omission,
  // rejects a mistyped author field.
  await Deno.writeTextFile(join(directory, "index.qmd"), document(policy + "    attemps: 3\n"));
  result = await command(quarto, ["render", "--fail-if-warnings"]);
  assert(!result.ok && result.text.includes("attemps"), "Unknown QMD fields must be rejected");
  console.log("PASS unknown QMD field survives extraction and is rejected");

  await Deno.writeTextFile(join(directory, "index.qmd"), document("  prairielearn: false\n"));
  result = await command(quarto, ["render", "--fail-if-warnings"]);
  assert(!result.ok, "An explicit false policy must not be silently treated as absent");
  console.log("PASS false QMD policy is rejected");

  await Deno.writeTextFile(join(directory, "index.qmd"), document());
  result = await command(quarto, ["render", "--fail-if-warnings"]);
  assert(result.ok, `Legacy assessment without policy must remain valid:\n${result.text}`);
  const legacy = JSON.parse(await Deno.readTextFile(modelPath));
  assert(!("prairielearn" in legacy.assessments[0].extensions), "Absent policy must not be fabricated");
  console.log("PASS legacy assessment and exercise profile");

  const config = await Deno.readTextFile(join(directory, "_quarto.yml"));
  const defaults = `prairielearn:
  assessment-defaults:
    attempts: 3
    pass:
      at-least: 2
    assignment:
      mode: assessment-id
`;
  await Deno.writeTextFile(join(directory, "_quarto.yml"), config + defaults);
  await Deno.writeTextFile(join(directory, "index.qmd"), document("  prairielearn: {}\n"));
  result = await command(quarto, ["render", "--fail-if-warnings"]);
  assert(result.ok, `Explicit opt-in must inherit defaults:\n${result.text}`);
  const derived = JSON.parse(await Deno.readTextFile(modelPath));
  const derivedPolicy = derived.assessments[0].extensions.prairielearn;
  const label = derivedPolicy.assignment["student-label"];
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode("policy-test\0sec-policy"));
  const expectedLabel = "pl-" + [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
  assert(label === expectedLabel, "Derived label must use the documented canonical key");
  assert(derivedPolicy.attempts === 3 && derivedPolicy.pass["at-least"] === 2 &&
    !("mode" in derivedPolicy.assignment), "Only normalized fields belong in the model");
  console.log("PASS explicit opt-in, inherited defaults and deterministic assignment label");

  await Deno.writeTextFile(join(directory, "index.qmd"), document(`  prairielearn:
    attempts: 4
    assignment:
      student-label: essay-retake
`));
  result = await command(quarto, ["render", "--fail-if-warnings"]);
  assert(result.ok, `Local policy must override defaults:\n${result.text}`);
  const overridden = JSON.parse(await Deno.readTextFile(modelPath)).assessments[0].extensions.prairielearn;
  assert(overridden.attempts === 4 && overridden.pass["at-least"] === 2 &&
    overridden.assignment["student-label"] === "essay-retake", "Local selector replaces the default strategy");
  console.log("PASS local field and assignment override");

  await Deno.writeTextFile(join(directory, "index.qmd"), document());
  result = await command(quarto, ["render", "--fail-if-warnings"]);
  assert(result.ok, `Unconnected assessment must remain valid with defaults:\n${result.text}`);
  const unconnected = JSON.parse(await Deno.readTextFile(modelPath));
  assert(!("prairielearn" in unconnected.assessments[0].extensions), "Defaults must not silently opt in");
  console.log("PASS defaults do not opt in unrelated assessments");

  await Deno.mkdir(join(directory, "nested"));
  await Deno.writeTextFile(join(directory, "nested/moved.qmd"),
    document("  prairielearn: {}\n").replace("# Контрольная", "# Новое название"));
  await Deno.writeTextFile(join(directory, "_quarto.yml"),
    (config + defaults).replace("render: [index.qmd]", "render: [nested/moved.qmd]"));
  result = await command(quarto, ["render", "--fail-if-warnings"]);
  assert(result.ok, `Relocated QMD must render:\n${result.text}`);
  assert(JSON.parse(await Deno.readTextFile(modelPath)).assessments[0].extensions.prairielearn.assignment["student-label"] === label,
    "Moving and renaming a page must not change assignment identity");
  await Deno.writeTextFile(join(directory, "_quarto.yml"), config + defaults);
  console.log("PASS assignment label survives moving and renaming QMD");

  const invalidQmd: [string, string, string][] = [
    ["unknown mode", `  prairielearn:\n    assignment:\n      mode: random\n`, defaults],
    ["both assignment strategies", `  prairielearn:\n    assignment:\n      mode: assessment-id\n      student-label: explicit\n`, defaults],
    ["unknown source field", `  prairielearn:\n    attemps: 5\n`, defaults],
    ["list policy", `  prairielearn: []\n`, defaults],
    ["boolean defaults", `  prairielearn: {}\n`, "prairielearn:\n  assessment-defaults: false\n"],
    ["list defaults", `  prairielearn: {}\n`, "prairielearn:\n  assessment-defaults: []\n"],
  ];
  for (const [name, sourcePolicy, sourceDefaults] of invalidQmd) {
    await Deno.writeTextFile(join(directory, "_quarto.yml"), config + sourceDefaults);
    await Deno.writeTextFile(join(directory, "index.qmd"), document(sourcePolicy));
    result = await command(quarto, ["render", "--fail-if-warnings"]);
    assert(!result.ok, `Invalid author policy must fail: ${name}`);
    console.log(`PASS rejected QMD ${name}`);
  }

  // Core visibility is projected before the adapter sees the document. A
  // public manual demo must not become a PL question through global defaults.
  await Deno.writeTextFile(join(directory, "_quarto.yml"), config + defaults + `profile:
  default: student
  group: [[student, full]]
`);
  for (const view of ["student", "full"]) {
    await Deno.writeTextFile(join(directory, `_quarto-${view}.yml`), `course:\n  view: ${view}\n`);
  }
  const privateDocument = document("  prairielearn: {}\n")
    .replace(':::: {#exr-experiment', ':::::: {.when-full}\n\n:::: {#exr-experiment')
    .replace('Описание задания.\n::::', `Описание задания.

::: {.grading-notes}
PRIVATE-GRADER-CRITERION.
:::
::::`) + `
::::::

:::: {#exr-public-demo target="manual" project="/projects/example"}
## Открытая демонстрация

Public example statement.
::::
`;
  await Deno.writeTextFile(join(directory, "index.qmd"), privateDocument);
  result = await command(quarto, ["render", "--profile", "student", "--fail-if-warnings"]);
  assert(result.ok, `Student view must render:\n${result.text}`);
  const student = JSON.parse(await Deno.readTextFile(modelPath));
  assert(student.course.view === "student" && student.assessments.length === 0 &&
    student.exercises.length === 1 && student.exercises[0].target === "manual",
    "Student model must contain the public demo only");
  const studentText = JSON.stringify(student) + await Deno.readTextFile(join(directory, "index.html"));
  assert(!studentText.includes("PRIVATE-GRADER-CRITERION") && !studentText.includes("exr-experiment"),
    "Private questions and criteria must not leak into student model or HTML");
  result = await command(quarto, ["render", "--profile", "full", "--fail-if-warnings"]);
  assert(result.ok, `Full view must render:\n${result.text}`);
  const full = JSON.parse(await Deno.readTextFile(modelPath));
  assert(full.course.view === "full" && full.assessments.length === 1 && full.exercises.length === 4,
    "Full view must retain three controls and the public demo");
  const question = full.exercises.find((e: { id: string }) => e.id === "exr-experiment");
  assert(!JSON.stringify(question.body).includes("PRIVATE-GRADER-CRITERION") &&
    JSON.stringify(question.gradingNotes).includes("PRIVATE-GRADER-CRITERION"),
    "Statement and grading notes must remain separate for future export");
  assert(!("prairielearn" in full.exercises.find((e: { id: string }) => e.id === "exr-public-demo").extensions),
    "A manual demo must not acquire a PrairieLearn adapter payload");
  console.log("PASS full/student projection, private notes separation and manual demo exclusion");

  // A plain Core assessment may contain manual exercises; a shared student
  // label may legitimately select both the main assessment and a retake.
  const plain = structuredClone(legacy);
  plain.exercises[0].target = "manual";
  plain.exercises[0].extensions = {};
  const retake = structuredClone(valid);
  retake.assessments.push({ ...structuredClone(retake.assessments[0]), id: "sec-retake" });
  for (const [name, model] of [["plain Core assessment", plain], ["shared label for retake", retake]]) {
    await Deno.writeTextFile(join(directory, "candidate.json"), JSON.stringify(model));
    result = await command(cue, ["vet", join(core, "spec/core.cue"),
      join(adapter, "spec/prairielearn.cue"), "candidate.json", "-d", "#Course", "-c"]);
    assert(result.ok, `${name} must remain valid:\n${result.text}`);
    console.log(`PASS ${name}`);
  }
} finally {
  await Deno.remove(directory, { recursive: true });
}
