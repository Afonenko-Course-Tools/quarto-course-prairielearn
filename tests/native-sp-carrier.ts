import { decodeNativeBusiness } from "../_extensions/course-prairielearn/public.ts";
const root = Deno.args[0];
if (!root) throw Error("Требуется exact SP source checkout");
const ref = "8c8622d7be5043f32a611717064bc642a346f1e0";
async function git(args: string[]) {
  const p = await new Deno.Command("git", {
    args: ["-C", root, ...args],
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!p.success) throw Error(new TextDecoder().decode(p.stderr));
  return new TextDecoder().decode(p.stdout);
}
if ((await git(["rev-parse", "HEAD"])).trim() !== ref) {
  throw Error("Exact SP input changed");
}
const paths = (await git([
  "grep",
  "-l",
  'target="prairielearn"',
  ref,
  "--",
  "*.qmd",
])).trim().split("\n").map((x) => x.slice(ref.length + 1));
const declarations = [];
for (const path of paths) {
  for (const line of (await git(["show", ref + ":" + path])).split("\n")) {
    if (!/^:{3,}.*target="prairielearn"/.test(line)) {
      continue;
    }
    const id = line.match(/#(exr-[a-z0-9-]+)/)?.[1],
      mode = line.match(/prairielearn-submission="([a-z]+)"/)?.[1],
      grading = line.match(/prairielearn-grading="([a-z]+)"/)?.[1];
    if (!id || !mode || grading !== "manual") {
      throw Error("SP target must keep explicit mode/Manual");
    }
    declarations.push({
      id,
      attributes: {
        "prairielearn-submission": mode,
        "prairielearn-grading": grading,
      },
    });
  }
}
if (
  declarations.length !== 7 ||
  declarations.filter((d) =>
      d.attributes["prairielearn-submission"] === "upload"
    ).length !== 6 ||
  declarations.filter((d) =>
      d.attributes["prairielearn-submission"] === "workspace"
    ).length !== 1
) throw Error("Actual7 mode values changed");
const config = {
  "question-defaults": {
    topic: "System",
    grading: { method: "manual" },
    submission: {
      mode: "workspace",
      workspaceOptions: {
        image: "example.invalid/fixture-only@sha256:" + "0".repeat(64),
        home: "/workspace",
        port: 8080,
        gradedFiles: [
          "work/**",
          "work/.git/**",
          "work/.*",
          "explanation.m[d]",
          ".pl-seed/identity.jso[n]",
        ],
      },
    },
  },
};
const result = decodeNativeBusiness({ config, declarations }, {
  course: { adapters: ["prairielearn"] },
  declarations,
});
for (const d of declarations) {
  if (
    result.questions[d.id].submission.mode !==
      d.attributes["prairielearn-submission"]
  ) throw Error("Inherited carrier changed authored mode");
}
console.log(
  JSON.stringify(
    {
      ref,
      actualModes: declarations.map((d) => ({
        id: d.id,
        mode: result.questions[d.id].submission.mode,
      })),
      fixtureOnlyImage: true,
    },
    null,
    2,
  ),
);
