import { join } from "node:path";
const core = Deno.args[0];
if (!core) throw Error("usage: native-model.ts CORE_REPOSITORY");
const root = await Deno.makeTempDir();
const adapter = "prairielearn";
try {
  const model = {
    course: { view: "full" },
    registeredTargets: ["manual", adapter],
    exercises: [{
      id: "exr-native",
      project: "",
      head: { kind: "Div", level: 0, title: "" },
      body: { "pandoc-api-version": [1, 23, 1], meta: {}, blocks: [] },
      nested: 0,
      unknownAttributes: [],
      source: "index.qmd",
      extensions: {},
    }],
    assessments: [],
  };
  const path = join(root, "model.json");
  await Deno.writeTextFile(path, JSON.stringify(model));
  const result = await new Deno.Command(Deno.env.get("CUE") || "cue", {
    args: [
      "vet",
      join(core, "_extensions/course-core/spec/core.cue"),
      "_extensions/course-" + adapter + "/spec/" + adapter + ".cue",
      path,
      "-d",
      "#Course",
      "-c",
      "--all-errors",
    ],
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!result.success) throw Error(new TextDecoder().decode(result.stderr));
  model.exercises[0] = {
    ...model.exercises[0],
    target: "manual",
  } as typeof model.exercises[0];
  model.assessments.push({
    id: "sec-work",
    kind: "test",
    source: "work.qmd",
    items: ["exr-native"],
    requirements: { "exr-native": "required" },
    title: "Работа",
    memberContainers: 1,
    memberKinds: ["OrderedList"],
    memberSizes: [1],
    body: { "pandoc-api-version": [1, 23, 1], meta: {}, blocks: [] },
    extensions: {
      prairielearn: {
        attempts: 1,
        pass: { "at-least": 1 },
        assignment: { "student-label": "work" },
      },
    },
  } as never);
  await Deno.writeTextFile(path, JSON.stringify(model));
  const invalid = await new Deno.Command(Deno.env.get("CUE") || "cue", {
    args: [
      "vet",
      join(core, "_extensions/course-core/spec/core.cue"),
      "_extensions/course-prairielearn/spec/prairielearn.cue",
      path,
      "-d",
      "#Course",
      "-c",
      "--all-errors",
    ],
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (
    invalid.success ||
    !new TextDecoder().decode(invalid.stderr).includes(
      "PL001_externalAssessmentMembers",
    )
  ) {
    throw Error(
      "Именованное правило PrairieLearn для состава работы потеряно: " +
        new TextDecoder().decode(invalid.stderr),
    );
  }
  console.log(
    "Native exercise without owner, target, role, difficulty or source topic is valid with " +
      adapter,
  );
} finally {
  await Deno.remove(root, { recursive: true });
}
