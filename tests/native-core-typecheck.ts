// Адресный checker: Source repo Core либо owner/extension установленной composition.
// Запуск: quarto run tests/native-core-typecheck.ts CORE_ROOT
// --course-export ограничивает запуск новым affected graph и его одним negative.
// --legacy-boundary — сохранённое имя режима проверки runtime/native handoff.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeNativeCoreImportMap } from "../tools/native-core-import-map.ts";
const repo = dirname(dirname(fileURLToPath(import.meta.url)));
if (!Deno.args[0]) throw Error("Требуется путь Source/installed Core");
const courseExport = Deno.args.includes("--course-export");
const legacyBoundary = Deno.args.includes("--legacy-boundary");
const temporary = await Deno.makeTempDir({ prefix: "pl-core-typecheck-" });
try {
  const map = resolve(temporary, "imports.json");
  const dependency = (flag: string): string | undefined => {
    const index = Deno.args.indexOf(flag);
    if (index < 0) return undefined;
    const value = Deno.args[index + 1];
    if (!value || value.startsWith("--"))
      throw Error("Укажите путь после " + flag);
    return value;
  };
  const qrc = dependency("--qrc-root"),
    download = dependency("--download-root");
  await writeNativeCoreImportMap(Deno.args[0], map, {
    ...(qrc ? { "reference-catalog": qrc } : {}),
    ...(download ? { "project-download": download } : {}),
  });
  const args = ["check", "--no-config", "--no-lock", "--import-map", map];
  const positive = await new Deno.Command(Deno.execPath(), {
    args: [
      ...args,
      ...(courseExport || legacyBoundary
        ? [
            resolve(
              repo,
              "_extensions/course-prairielearn/application/native-course.ts",
            ),
          ]
        : [
            resolve(
              repo,
              "_extensions/course-prairielearn/application/native-entry.ts",
            ),
            resolve(repo, "tests/native-core-boundary-types.ts"),
            resolve(repo, "tests/native-materialization-types.ts"),
          ]),
      resolve(repo, "tests/native-course-export-types.ts"),
      resolve(repo, "tests/native-legacy-boundary-types.ts"),
      ...(legacyBoundary
        ? [
            resolve(repo, "tests/export-course.test.ts"),
            resolve(repo, "tests/java-build.test.ts"),
            resolve(repo, "tests/text-runtime.test.ts"),
          ]
        : []),
      resolve(repo, "tests/native-core-typecheck.ts"),
    ],
    stdout: "inherit",
    stderr: "inherit",
  }).output();
  if (!positive.success) Deno.exit(positive.code);
  const nativeWriterSource = [
    "native-writer-source-bytes",
    `
      import {exportCourse} from "pl-native/export-course.ts";
      import type {NativeCompilerInput} from "pl-native/export-course.ts";
      declare const input: Parameters<typeof exportCourse>[0], selection: NativeCompilerInput;
      exportCourse({...input,nativeInputs:{example:{...selection,sources:[{name:"Main.java",data:new Uint8Array()}]}}});
    `,
    "TS2353|TS2769",
  ];
  const boundaryNegatives = [
    [
      "selected-file-needs-bytes",
      `
      import type {NativeCompilerInput} from "pl-native/export-course.ts";
      const file: NativeCompilerInput["sources"][number] = {name:"Study.java",data:"YWJj"};
    `,
      "TS2353",
    ],
    [
      "artifact-has-no-raw-source",
      `
      import type {ArtifactFile} from "course-core/public.ts";
      declare const file:ArtifactFile;
      const physical:ArtifactFile={...file,rawSource:"private/Study.java"};
    `,
      "TS2353",
    ],
    [
      "export-needs-content",
      `
      import {exportCourse} from "pl-native/export-course.ts";
      declare const input:Parameters<typeof exportCourse>[0];
      exportCourse({...input,result:{model:{}}});
    `,
      "TS2353",
    ],
  ];
  for (const [name, code, diagnostic] of legacyBoundary
    ? boundaryNegatives
    : courseExport
      ? [nativeWriterSource]
      : [
          ...boundaryNegatives,
          nativeWriterSource,
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
      import {withNativeCaptureScope} from "course-core/public.ts";
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
        ]) {
    if (!name || !code || !diagnostic)
      throw Error("Неполный отрицательный TS fixture");
    const source = resolve(temporary, name + ".ts");
    await Deno.writeTextFile(source, code);
    const result = await new Deno.Command(Deno.execPath(), {
      args: [...args, source],
      stdout: "piped",
      stderr: "piped",
    }).output();
    const output =
      new TextDecoder().decode(result.stdout) +
      new TextDecoder().decode(result.stderr);
    const expectedReason =
      name === "native-writer-source-bytes"
        ? "'data' does not exist in type"
        : undefined;
    if (
      result.success ||
      !diagnostic.split("|").some((code) => output.includes(code)) ||
      (expectedReason !== undefined && !output.includes(expectedReason))
    ) {
      throw Error("Не получен ожидаемый отказ " + name + ": " + output);
    }
    console.log(name + ": ожидаемый " + diagnostic);
  }
} finally {
  await Deno.remove(temporary, { recursive: true });
}
