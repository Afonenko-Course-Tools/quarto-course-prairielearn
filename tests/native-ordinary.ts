import { join } from "node:path";
const coreArgument = Deno.args[0];
if (!coreArgument) throw Error("usage: native-ordinary.ts CORE");
const core = await Deno.realPath(coreArgument);
const repo = Deno.cwd(),
  root = await Deno.makeTempDir({ prefix: "native-ordinary-" });
const adapter = "prairielearn";
async function command(args: string[]) {
  const result = await new Deno.Command(Deno.env.get("QUARTO") || "quarto", {
    args,
    cwd: root,
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!result.success) {
    throw Error(
      new TextDecoder().decode(result.stderr) +
        new TextDecoder().decode(result.stdout),
    );
  }
}
try {
  await command(["add", core, "--no-prompt"]);
  await command(["add", repo, "--no-prompt"]);
  await Deno.writeTextFile(
    join(root, "_quarto.yml"),
    `project:
  type: default
  pre-render: _extensions/course-core/entrypoints/pre.ts
  post-render: _extensions/course-core/entrypoints/post.ts
format: html
filters: [course-core, course-${adapter}]
course:
  adapters: [${adapter}]
`,
  );
  await Deno.writeTextFile(
    join(root, "index.qmd"),
    "# Native exercises\n\n::: {#exr-native}\nOrdinary exercise without owner, target or educational metadata.\n:::\n",
  );
  await command(["render", "--fail-if-warnings"]);
  const html = await Deno.readTextFile(join(root, "index.html"));
  if (!html.includes("Ordinary exercise")) {
    throw Error("native render lost condition");
  }
  console.log(
    "Installed " + adapter +
      " leaves native rendering valid without course identity",
  );
} finally {
  await Deno.remove(root, { recursive: true });
}
