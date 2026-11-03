// Адресный checker: Source repo Core либо owner/extension установленной composition.
// Запуск: quarto run tests/native-core-typecheck.ts CORE_ROOT
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const repo = dirname(dirname(fileURLToPath(import.meta.url)));
if (!Deno.args[0]) throw Error("Требуется путь Source/installed Core");
let core: string | undefined;
for (
  const path of [
    resolve(Deno.args[0], "_extensions/course-core"),
    resolve(Deno.args[0], "_extensions/Afonenko-Course-Tools/course-core"),
    resolve(Deno.args[0]),
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
const temporary = await Deno.makeTempDir({ prefix: "pl-core-typecheck-" });
try {
  const map = resolve(temporary, "imports.json");
  await Deno.writeTextFile(
    map,
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
  const args = ["check", "--no-config", "--no-lock", "--import-map", map];
  const positive = await new Deno.Command(Deno.execPath(), {
    args: [
      ...args,
      resolve(
        repo,
        "_extensions/course-prairielearn/application/native-entry.ts",
      ),
      resolve(repo, "tests/native-core-boundary-types.ts"),
      resolve(repo, "tests/native-core-typecheck.ts"),
    ],
    stdout: "inherit",
    stderr: "inherit",
  }).output();
  if (!positive.success) Deno.exit(positive.code);
  for (
    const [name, code, diagnostic] of [
      [
        "adapter-method",
        `
      import type {PublicCore} from "pl-native/native-adapter.ts";
      declare const core: PublicCore;
      core.withPendngNativeOperation({}, async () => {});
    `,
        "TS2551",
      ],
      [
        "scope-method",
        `
      import type {NativeCaptureScope} from "course-core/public.ts";
      declare const scope: NativeCaptureScope;
      scope.withPreparedOperaton(async () => {});
    `,
        "TS2551",
      ],
      [
        "preparation",
        `
      import {withNativeCaptureScope} from "course-core/capture.ts";
      withNativeCaptureScope({root:"/owner",projection:"author",outputDirectory:"/owner/out"},
        {assignment:{mode:"new",prepare:async () => ({expectedSources:["work.qmd"],
          assessments:[{source:"work.qmd",assessmentId:"work"}]})}}, async () => {});
    `,
        "TS2322",
      ],
      [
        "descriptor",
        `
      import type {NativePreparedLease,NativePreparedOperation} from "course-core/public.ts";
      declare const lease: NativePreparedLease, descriptor: NativePreparedOperation;
      lease.assert({...descriptor,identity:{...descriptor.identity,projection:"full"}});
    `,
        "TS2322",
      ],
    ]
  ) {
    const source = resolve(temporary, name + ".ts");
    await Deno.writeTextFile(source, code);
    const result = await new Deno.Command(Deno.execPath(), {
      args: [...args, source],
      stdout: "piped",
      stderr: "piped",
    }).output();
    const output = new TextDecoder().decode(result.stdout) +
      new TextDecoder().decode(result.stderr);
    if (result.success || !output.includes(diagnostic)) {
      throw Error("Не получен ожидаемый отказ " + name + ": " + output);
    }
    console.log(name + ": ожидаемый " + diagnostic);
  }
} finally {
  await Deno.remove(temporary, { recursive: true });
}
