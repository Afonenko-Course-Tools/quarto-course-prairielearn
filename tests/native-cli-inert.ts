import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { cpSync } from "node:fs";
const repo = dirname(dirname(fileURLToPath(import.meta.url))),
  core = join(Deno.args[0], "_extensions/course-core");
const rows = [];
for (const command of ["export-course", "export"]) {
  for (const control of ["unqualified", "missing", "foreign"]) {
    const root = await Deno.makeTempDir({ prefix: "pl-inert-" }),
      owner = join(root, "tasks"),
      receipt = join(root, "calls.json");
    try {
      await Deno.mkdir(join(owner, "_extensions"), { recursive: true });
      cpSync(core, join(owner, "_extensions/course-core"), { recursive: true });
      await Deno.writeTextFile(
        join(owner, "_quarto.yml"),
        "project: {type: default}\nengines: [unknown.ts]\n",
      );
      await Deno.writeTextFile(
        join(owner, "index.qmd"),
        "# Неизвестный producer\n",
      );
      await Deno.writeTextFile(
        join(owner, "unknown.ts"),
        `Deno.writeTextFileSync(${
          JSON.stringify(join(root, "ENGINE_EXECUTED"))
        },'top-level');export const engine={name:'unknown'};`,
      );
      const operation = "11111111-1111-4111-8111-111111111111",
        base = join(owner, "_generated/course-spec/prairielearn-native");
      if (control !== "missing") {
        await Deno.mkdir(join(base, operation), { recursive: true });
        await Deno.writeTextFile(
          join(base, "active.json"),
          JSON.stringify({ operation }),
        );
        await Deno.writeTextFile(
          join(base, operation, "request.json"),
          JSON.stringify({
            schema: "pl-native-business-request-v1",
            owner: control === "foreign" ? root : owner,
            identity: {
              operation,
              profiles: ["full"],
              projection: "author",
              runtime: "quarto-1.11.5",
            },
            outputDirectory: join(owner, "_site"),
            inputs: [{
              source: "index.qmd",
              captureWitness: "22222222-2222-4222-8222-222222222222",
              file: "candidate.json",
            }],
          }),
        );
      }
      const wrapper = join(root, "wrapper.ts");
      await Deno.writeTextFile(
        wrapper,
        `import {pathToFileURL} from 'node:url';const receipt=${
          JSON.stringify(receipt)
        };const state={children:0,ambient:0,error:''};const save=()=>Deno.writeTextFileSync(receipt,JSON.stringify(state));save();const Actual=Deno.Command;(Deno as any).Command=new Proxy(Actual,{construct(){state.children++;save();throw Error('UNEXPECTED_NATIVE_CHILD')}});const wrap=(..._args:any[])=>{state.ambient++;save();return (v:any)=>v};(globalThis as any)[Symbol.for('course.performance.agent.v1')]={abiVersion:1,metrics:{wrapSync:wrap,wrapAsync:wrap,wrapWalk:wrap,childEnv:wrap}};Deno.env.set('COURSE_PERF_MODE','summary');const entry=Deno.args.shift()!;try{await import(pathToFileURL(entry).href)}catch(error){state.error=String(error);save();Deno.exitCode=1}`,
      );
      const entry = join(
        repo,
        "_extensions/course-prairielearn/entrypoints/" + command + ".ts",
      );
      const args = command === "export-course"
        ? [
          root,
          join(root, "out"),
          "--instance",
          "test",
          "--checks-output",
          join(root, "checks.json"),
        ]
        : [
          root,
          "tasks",
          "sec-work",
          join(root, "binding.json"),
          join(root, "out"),
        ];
      const child = await new Deno.Command("quarto", {
        args: ["run", wrapper, entry, ...args],
        stdout: "piped",
        stderr: "piped",
        env: { COURSE_PERF_MODE: "" },
      }).output();
      const state = JSON.parse(await Deno.readTextFile(receipt));
      if (child.success || state.children || state.ambient) {
        throw Error(
          command + "/" + control + " crossed inert gate: " +
            JSON.stringify(state) + "\n" +
            new TextDecoder().decode(child.stderr),
        );
      }
      if (
        control === "unqualified" &&
        !state.error.includes("BODY.PRODUCER_INPUT_UNQUALIFIED")
      ) throw Error("wrong public gate refusal: " + JSON.stringify(state));
      for (
        const path of [
          join(root, "out"),
          join(root, "checks.json"),
          join(root, "ENGINE_EXECUTED"),
        ]
      ) {
        try {
          await Deno.lstat(path);
          throw Error("effect escaped: " + path);
        } catch (error) {
          if (!(error instanceof Deno.errors.NotFound)) throw error;
        }
      }
      rows.push({ command, control, ...state, exitCode: child.code });
    } finally {
      await Deno.remove(root, { recursive: true });
    }
  }
}
console.log(
  JSON.stringify(
    { status: "REAL_CLI_INERT_REFUSAL_ONLY_NOT_ASSIGNMENT_POSITIVE", rows },
    null,
    2,
  ),
);
