// Адресный checker: Source repo Core либо owner/extension установленной composition.
// Запуск: quarto run tests/native-core-typecheck.ts CORE_ROOT
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeNativeCoreImportMap } from "../tools/native-core-import-map.ts";
const repo = dirname(dirname(fileURLToPath(import.meta.url)));
if (!Deno.args[0]) throw Error("Требуется путь Source/installed Core");
const temporary = await Deno.makeTempDir({ prefix: "pl-core-typecheck-" });
try {
  const map = resolve(temporary, "imports.json");
  await writeNativeCoreImportMap(Deno.args[0], map);
  const args = ["check", "--no-config", "--no-lock", "--import-map", map];
  const positive = await new Deno.Command(Deno.execPath(), {
    args: [
      ...args,
      resolve(
        repo,
        "_extensions/course-prairielearn/application/native-entry.ts",
      ),
      resolve(repo, "tests/native-core-boundary-types.ts"),
      resolve(repo, "tests/native-materialization-types.ts"),
      resolve(repo, "tests/native-core-typecheck.ts"),
    ],
    stdout: "inherit",
    stderr: "inherit",
  }).output();
  if (!positive.success) Deno.exit(positive.code);
  for (
    const [name, code, diagnostic] of [
      [
        "authored-feedback",
        `
      import {runtimeDescriptor} from "pl-native/runtime-descriptor.ts";
      import type {NativeProjectCheck} from "pl-native/native-checks.ts";
      declare const check: NativeProjectCheck;
      runtimeDescriptor({...check,feedback:{requirement:"r",whatCheck:"runtime"}}, {javaRelease:25}, [], []);
    `,
        "TS2561",
      ],
      [
        "runtime-feedback",
        `
      import type {runtimeDescriptor} from "pl-native/runtime-descriptor.ts";
      const feedback: NonNullable<ReturnType<typeof runtimeDescriptor>["feedback"]> = {requirement:"r","what-check":"authored"};
    `,
        "TS2353",
      ],
      [
        "materialization-plan",
        `
      import {materializeNativeQuestion} from "pl-native/native-materialize.ts";
      declare const input: Parameters<typeof materializeNativeQuestion>[0];
      materializeNativeQuestion({...input,pair:{...input.pair,student:{...input.pair.student,audience:"author"}}});
    `,
        "TS2322",
      ],
      [
        "materialization-condition",
        `
      import {materializeNativeQuestion} from "pl-native/native-materialize.ts";
      declare const input: Parameters<typeof materializeNativeQuestion>[0];
      materializeNativeQuestion({...input,condition:input.pair.student});
    `,
        "TS2322",
      ],
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
