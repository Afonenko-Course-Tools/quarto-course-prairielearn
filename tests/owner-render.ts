// Test-only caller of the installed Core lifecycle. Every mutation/profile gets
// a new root; completed private owner state is never erased or reused.
import { copy } from "stdlib/fs";
import { join, toFileUrl } from "stdlib/path";

const stages: string[] = [];
export async function disposeOwners() {
  for (const stage of stages) await Deno.remove(stage, { recursive: true });
}
export async function renderOwner(source: string, profile: "student" | "full") {
  const stage = await Deno.makeTempDir({ prefix: "adapter-owner-" });
  stages.push(stage);
  await copy(source, stage, { overwrite: true });
  const quarto = Deno.env.get("QUARTO") || "quarto";
  const extension = join(stage, "_extensions/course-core");
  const previous = Deno.env.get("QUARTO_PROFILE");
  Deno.env.set("QUARTO_PROFILE", profile);
  async function command(args: string[]) {
    const result = await new Deno.Command(quarto, {
      args, cwd: stage, stdout: "piped", stderr: "piped",
    }).output();
    const text = new TextDecoder().decode(result.stdout) + new TextDecoder().decode(result.stderr);
    if (!result.success) throw new Error(text);
    return text;
  }
  try {
    // Core owns stale model cleanup, including refusal before the engine starts.
    await command(["run", join(extension, "entrypoints/pre.ts")]);
    const api = await import(toFileUrl(join(extension, "owner-preflight/owner.ts")).href);
    const prepared = await api.prepareOwner(stage, { attemptId: crypto.randomUUID(), profile, extension: "_extensions/course-core" });
    try {
      await Deno.stat(join(stage, "_generated/course-spec/prairielearn"));
      throw new Error("Private capture wrote public prairielearn fragments");
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    }
    const metadata = await api.activateOwner(prepared);
    const metadataPath = join(stage, ".course-owner/render-metadata.json");
    await Deno.writeTextFile(metadataPath, JSON.stringify(metadata));
    const text = await command([
      "render", ".", "--profile", profile, "--to", "html", "--execute",
      "--no-cache", "--no-execute-daemon", "--fail-if-warnings", "--metadata-file", metadataPath,
    ]);
    const { check } = await import(toFileUrl(join(extension, "application/check.ts")).href);
    const { runtime } = await import(toFileUrl(join(extension, "infrastructure/runtime.ts")).href);
    await check(runtime(stage, [], false));
    const finished = await api.finishOwner(prepared);
    if (finished.exitCode !== 0) throw new Error(JSON.stringify(finished));
    await api.validateOwnerResources(prepared);
    const evidence = Deno.env.get("ADAPTER_EVIDENCE");
    if (evidence) {
      const destination = join(evidence, `attempt-${stages.length}-${profile}`);
      await Deno.mkdir(destination, { recursive: true });
      await Deno.copyFile(join(stage, "_generated/course-spec/course.json"), join(destination, "course.json"));
      await Deno.writeTextFile(join(destination, "owner-result.json"), JSON.stringify(finished, null, 2));
      async function retainHtml(directory: string) {
        for await (const entry of Deno.readDir(directory)) {
          const output = join(directory, entry.name);
          if (entry.isDirectory) await retainHtml(output);
          else if (entry.isFile && entry.name.endsWith(".html")) {
            const path = join(destination, output.slice(stage.length + 1));
            await Deno.mkdir(path.slice(0, path.lastIndexOf("/")), { recursive: true });
            await Deno.copyFile(output, path);
          }
        }
      }
      await retainHtml(finished.report.outputs);
    }
    return { ok: true, text, stage };
  } catch (error) {
    const text = String(error) + "\n" + JSON.stringify(error);
    const evidence = Deno.env.get("ADAPTER_EVIDENCE");
    if (evidence) {
      const destination = join(evidence, `attempt-${stages.length}-${profile}`);
      await Deno.mkdir(destination, { recursive: true });
      await Deno.writeTextFile(join(destination, "failure.txt"), text);
    }
    return { ok: false, text, stage };
  } finally {
    if (previous === undefined) Deno.env.delete("QUARTO_PROFILE");
    else Deno.env.set("QUARTO_PROFILE", previous);
  }
}

// A capture marker without a preceding Core pass must not bypass adapter order.
export async function refuseUnprocessedMarker(source: string) {
  const stage = await Deno.makeTempDir({ prefix: "adapter-marker-" });
  stages.push(stage);
  await copy(join(source, "_extensions"), join(stage, "_extensions"));
  await Deno.writeTextFile(join(stage, "_quarto.yml"), `project:
  type: default
  render: [index.qmd]
format: html
course:
  id: marker-spoof
course-core-capture: true
filters: [course-prairielearn]
`);
  await Deno.writeTextFile(join(stage, "index.qmd"), "# Проверка порядка\n\nОбычный документ.\n");
  const result = await new Deno.Command(Deno.env.get("QUARTO") || "quarto", {
    args: ["render", "index.qmd", "--to", "html", "--no-execute"],
    cwd: stage, stdout: "piped", stderr: "piped",
  }).output();
  const text = new TextDecoder().decode(result.stdout) + new TextDecoder().decode(result.stderr);
  if (result.success || !text.includes("course-core должен предшествовать")) {
    throw new Error(`Маркер capture без Core не должен обходить проверку порядка: ${text}`);
  }
  console.log("ПРОЙДЕНО: авторский маркер capture без Core не обходит порядок фильтров");
}
