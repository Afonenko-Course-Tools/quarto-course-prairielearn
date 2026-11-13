// Каноническая проверка C: typed owner contracts и genuine ordinary producer.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeNativeCoreImportMap } from "../tools/native-core-import-map.ts";
const core = Deno.args[0];
const qrc = Deno.args[1];
const download = Deno.args[2];
if (!core) throw Error("Укажите immutable Core companion");
const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const files = [];
for await (const e of Deno.readDir(new URL("./", import.meta.url))) {
  if (e.name.endsWith(".test.ts")) files.push("tests/" + e.name);
}
const commands = [
  ["run", "--no-config", "-A", "tools/check-contracts.ts"],
  [
    "test",
    "--no-config",
    "--allow-read",
    "--allow-write",
    "--allow-run",
    "--allow-env",
    ...files.sort(),
  ],
];
const temporary = await Deno.makeTempDir({ prefix: "pl-check-imports-" });
try {
  const map = resolve(temporary, "imports.json");
  await writeNativeCoreImportMap(core, map, {
    ...(qrc ? { "reference-catalog": qrc } : {}),
    ...(download ? { "project-download": download } : {}),
  });
  for (const [command, ...args] of commands) {
    if (!command) throw Error("Пустая команда проверки");
    const r = await new Deno.Command(Deno.execPath(), {
      args: [command, "--import-map", map, ...args],
      cwd: repo,
      stdout: "inherit",
      stderr: "inherit",
    }).output();
    if (!r.success) throw Error("Canonical TS check failed: " + command);
  }
} finally {
  await Deno.remove(temporary, { recursive: true });
}
const r = await new Deno.Command("quarto", {
  args: ["run", "tests/native-scope-integration.ts", resolve(core)],
  cwd: repo,
  stdout: "inherit",
  stderr: "inherit",
}).output();
if (!r.success) throw Error("Genuine ordinary Core/C composition failed");
