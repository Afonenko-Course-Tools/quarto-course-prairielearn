// Общая type-only карта для existing compiler entries; runtime Core выбирается прежними gates.
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export async function writeNativeCoreImportMap(
  root: string,
  destination: string,
) {
  let core: string | undefined;
  for (
    const path of [
      resolve(root, "_extensions/course-core"),
      resolve(root, "_extensions/Afonenko-Course-Tools/course-core"),
      resolve(root),
    ]
  ) {
    try {
      if ((await Deno.stat(resolve(path, "public.ts"))).isFile) {
        core = await Deno.realPath(path);
        break;
      }
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    }
  }
  if (!core) throw Error("Публичный Core не найден");
  const repo = dirname(dirname(fileURLToPath(import.meta.url)));
  await Deno.writeTextFile(
    destination,
    JSON.stringify({
      imports: {
        "course-core/": pathToFileURL(core + "/").href,
        "pl-native/": pathToFileURL(
          resolve(repo, "_extensions/course-prairielearn/application") + "/",
        ).href,
        "stdlib/path": import.meta.resolve("stdlib/path").replace(
          "jsr:/",
          "jsr:",
        ),
        "stdlib/fs": import.meta.resolve("stdlib/fs").replace("jsr:/", "jsr:"),
      },
    }),
  );
}

if (import.meta.main) {
  if (!Deno.args[0] || !Deno.args[1]) {
    throw Error("Укажите фактический Core и путь type-only import map");
  }
  await writeNativeCoreImportMap(Deno.args[0], Deno.args[1]);
}
