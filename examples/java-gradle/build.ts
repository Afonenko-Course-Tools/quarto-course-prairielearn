import { join } from "node:path";
import { pathToFileURL } from "node:url";
const root = Deno.cwd();
async function extension(name: string) {
  for (const owner of ["", "Afonenko-Course-Tools/"]) {
    const path = join(root, "bank/_extensions", owner + name);
    try {
      if ((await Deno.stat(path)).isDirectory) return path;
    } catch (e) {
      if (!(e instanceof Deno.errors.NotFound)) throw e;
    }
  }
  throw Error("Установите " + name + " в bank");
}
const gradleHome = Deno.env.get("GRADLE_USER_HOME");
if (!gradleHome) throw Error("Задайте постоянный GRADLE_USER_HOME");
for (
  const [solution, success] of [["../reference", true], [
    "../student",
    false,
  ]] as const
) {
  const checked = await new Deno.Command("gradle", {
    args: ["--offline", "-Psolution=" + solution, "test"],
    cwd: join(root, "bank/projects/clamp/tests"),
    stdout: "inherit",
    stderr: "inherit",
  }).output();
  if (checked.success !== success) {
    throw Error("Неожиданный Gradle результат: " + solution);
  }
}
const adapter = await extension("course-prairielearn");
const { nativeEntry }: Pick<typeof import("../../_extensions/course-prairielearn/application/native-entry.ts"), "nativeEntry"> = await import(
  pathToFileURL(join(adapter, "application/native-entry.ts")).href
);
for (const variant of ["a", "b"]) {
  await nativeEntry({
    root,
    book: "bank",
    work: "sec-variant-" + variant,
    bindingPath: join(root, "binding.json"),
    output: join(root, "artifacts/variant-" + variant),
  });
}
const html = await new Deno.Command("quarto", {
  args: ["render", "--fail-if-warnings"],
  stdout: "inherit",
  stderr: "inherit",
}).output();
if (!html.success) Deno.exit(html.code);

const revision = await new Deno.Command("git", {
  args: ["rev-parse", "HEAD"],
  stdout: "piped",
  stderr: "null",
}).output();
await Deno.writeTextFile(
  "_site/BUILD.json",
  JSON.stringify(
    {
      sourceRepository: "Afonenko-Course-Tools/quarto-course-prairielearn",
      commit: Deno.env.get("DEMO_SOURCE_COMMIT") ||
        (revision.success
          ? new TextDecoder().decode(revision.stdout).trim()
          : ""),
      sourceDirty: Deno.env.get("DEMO_SOURCE_DIRTY") === "true",
      extensionVersion: "9.0.0",
      dependencies: { "quarto-course": "9.0.0" },
      projection: "full",
      verification: "local installed native build",
      livePlatformVerified: false,
    },
    null,
    2,
  ) + "\n",
);
