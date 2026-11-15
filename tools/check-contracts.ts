// Проверяет состав TS-контракта; не генерирует вторую схему/словарь.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const contract: unknown = JSON.parse(
  await Deno.readTextFile(
    join(root, "_extensions/course-prairielearn/contract.json"),
  ),
);
if (JSON.stringify(contract) !== '{"name":"prairielearn"}') {
  throw Error("Installed contract должен содержать только имя владельца");
}
let files = 0;
async function inspect(dir: string) {
  for await (const entry of Deno.readDir(dir)) {
    if ([".git", "node_modules", "_generated", ".quarto"].includes(entry.name))
      continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory) await inspect(path);
    else if (entry.isFile) {
      files++;
      if (entry.name.endsWith(".cue")) {
        throw Error("Удалённая schema dependency в final tree: " + path);
      }
      if (
        path.endsWith(".ts") ||
        path.endsWith(".lua") ||
        path.endsWith(".yml") ||
        path.endsWith(".json")
      ) {
        const text = await Deno.readTextFile(path);
        if (
          !path.endsWith("check-contracts.ts") &&
          /(?:setup-cue|spec\/(?:core|prairielearn)\.cue|Deno\.env\.get\(["']CUE["']\)|contract\.rules)/.test(
            text,
          )
        )
          throw Error("Удалённая tool/schema dependency: " + path);
      }
    }
  }
}
await inspect(root);
console.log(
  "PASS installed owner name, TS contracts и final source inventory: " +
    files +
    " файлов",
);
