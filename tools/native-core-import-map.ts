// Общая type-only карта для existing compiler entries; runtime Core выбирается прежними gates.
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export async function writeNativeCoreImportMap(
  root: string,
  destination: string,
  dependencies: {"reference-catalog"?: string; "project-download"?: string} = {},
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
  const publicImports: Record<string, string> = {};
  for (const [name, input] of Object.entries(dependencies)) {
    if (input === undefined) continue;
    let found: string | undefined;
    for (const path of [resolve(input, "_extensions", name), resolve(input, "_extensions/Afonenko-Course-Tools", name), resolve(input)]) {
      try {
        if ((await Deno.stat(resolve(path, "public.ts"))).isFile) { found = await Deno.realPath(path); break; }
      } catch (error) { if (!(error instanceof Deno.errors.NotFound)) throw error; }
    }
    if (!found) throw Error("Публичное расширение не найдено: " + name);
    publicImports[name + "/"] = pathToFileURL(found + "/").href;
  }
  const repo = dirname(dirname(fileURLToPath(import.meta.url)));
  const coreUrl = pathToFileURL(core + "/").href;
  const pl = resolve(repo, "_extensions/course-prairielearn");
  const download = publicImports["project-download/"];
  if (download !== undefined) {
    // Source Download сохраняет относительные импорты установленной композиции.
    // Проверка направляет только эти соседние public providers на реальные roots.
    const siblings = dirname(fileURLToPath(download));
    const providers: [string, string | undefined][] = [
      ["course-core", coreUrl],
      ["course-prairielearn", pathToFileURL(pl + "/").href],
      ["reference-catalog", publicImports["reference-catalog/"]],
    ];
    for (const [name, provider] of providers) {
      if (provider !== undefined) {
        publicImports[pathToFileURL(resolve(siblings, name) + "/").href] = provider;
      }
    }
  }
  await Deno.writeTextFile(
    destination,
    JSON.stringify({
      imports: {
        ...publicImports,
        "course-core/": coreUrl,
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
  await writeNativeCoreImportMap(Deno.args[0], Deno.args[1], {
    ...(Deno.args[2] ? {"reference-catalog":Deno.args[2]} : {}),
    ...(Deno.args[3] ? {"project-download":Deno.args[3]} : {}),
  });
}
