// Обычный полный TS gate; N0 запускает его под общим lock.
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const lint = Deno.args.includes("--lint");
const args = Deno.args.filter(arg => arg !== "--lint");
if ((lint && args.length !== 0) || (!lint && args.length !== 1)) {
  throw Error("Укажите путь import map для типов либо --lint для отдельной проверки any");
}
async function sources(directory: string): Promise<string[]> {
  const paths: string[] = [];
  for await (const entry of Deno.readDir(join(root, directory))) {
    if (["vendor", "node_modules", "_generated", ".quarto", ".git"].includes(entry.name) ||
      directory.startsWith("examples/") && entry.name === "_extensions") continue;
    const path = directory + "/" + entry.name;
    if (entry.isDirectory) paths.push(...await sources(path));
    else if (entry.isFile && path.endsWith(".ts")) paths.push(join(root, path));
  }
  return paths;
}
const files = (await Promise.all([
  "_extensions/course-prairielearn", "tools", "tests", "examples",
].map(sources))).flat().sort();
const config = join(root, "typecheck/deno.json");
const importMap = args[0];
let command: string[];
if (lint) command = ["lint", "--config", config, ...files];
else {
  if (!importMap) throw Error("Укажите непустой путь import map");
  command = ["check", "--no-lock", "--config", config, "--import-map", resolve(importMap), ...files];
}
const result = await new Deno.Command(Deno.execPath(), {
  args: command, cwd: root, stdout: "inherit", stderr: "inherit",
}).spawn().status;
Deno.exitCode = result.code;
