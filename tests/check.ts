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
      student-label: referat-s1-01
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
    extracted.assignment["student-label"] === "referat-s1-01" && Object.keys(extracted).length === 3,
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
