// Explicit example caller of the installed Core lifecycle; one fresh root per run.
import { copy } from "stdlib/fs";
import { join, toFileUrl } from "stdlib/path";
const profile = Deno.args[0] || "student";
if (!["student", "full"].includes(profile)) throw new Error("Профиль: student или full");
const source = await Deno.realPath(Deno.cwd());
const stage = await Deno.makeTempDir({ prefix: "adapter-author-" });
// These are the example's configured outputs and private runtime directories.
const omitted = new Set([".git", ".quarto", ".course-owner", "_generated", "_book"]);
for await (const entry of Deno.readDir(source)) {
  if (!omitted.has(entry.name)) await copy(join(source, entry.name), join(stage, entry.name));
}
const extensionPath = Deno.args[1] || "_extensions/course-core";
const extension = join(stage, extensionPath);
const quarto = Deno.env.get("QUARTO") || "quarto";
Deno.env.set("QUARTO_PROFILE", profile);
async function command(args: string[], cwd = stage) {
  const result = await new Deno.Command(quarto, {
    args, cwd, stdout: "inherit", stderr: "inherit",
  }).output();
  if (!result.success) throw new Error(`Команда Quarto завершилась с кодом ${result.code}`);
}
// Core owns stale model cleanup, including a refusal before the actual engine.
await command(["run", join(source, extensionPath, "entrypoints/pre.ts")], source);
await command(["run", join(extension, "entrypoints/pre.ts")]);
const api = await import(toFileUrl(join(extension, "owner-preflight/owner.ts")).href);
const prepared = await api.prepareOwner(stage, { attemptId: crypto.randomUUID(), profile, extension: extensionPath });
const metadata = await api.activateOwner(prepared);
const metadataPath = join(stage, ".course-owner/render-metadata.json");
await Deno.writeTextFile(metadataPath, JSON.stringify(metadata));
await command(["render", ".", "--profile", profile, "--to", "html", "--execute",
  "--no-cache", "--no-execute-daemon", "--fail-if-warnings", "--metadata-file", metadataPath]);
const { check } = await import(toFileUrl(join(extension, "application/check.ts")).href);
const { runtime } = await import(toFileUrl(join(extension, "infrastructure/runtime.ts")).href);
const validated = await check(runtime(stage, [], false));
// A rejected model must never reach owner completion or publication.
const result = await api.finishOwner(prepared);
if (result.exitCode !== 0) throw new Error(JSON.stringify(result));
await api.validateOwnerResources(prepared);
console.log(JSON.stringify({ profile, stage, outputs: result.report.outputs, model: validated.path }, null, 2));
