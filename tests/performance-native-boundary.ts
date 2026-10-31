// Отрицательная fixture публичной границы, не Core implementation/authority/P.
// Старые export-course Docker/inspect sites заменены accepted nativeEntry.
import { strict as assert } from "node:assert";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const root = await Deno.makeTempDir({ prefix: "pl-performance-native-" });
try {
  const core = join(root, "tasks/_extensions/course-core");
  await Deno.mkdir(core, { recursive: true });
  const log = join(root, "gate.json");
  await Deno.writeTextFile(
    join(core, "capture.ts"),
    `
export async function withNativeCaptureScope(request,options,use){
 await Deno.writeTextFile(${
      JSON.stringify(log)
    },JSON.stringify({request,mode:options.assignment.mode,prepare:typeof options.assignment.prepare,use:typeof use}));
 throw Error('PUBLIC_CORE_GATE_REFUSAL');
}`,
  );
  await Deno.writeTextFile(
    join(core, "public.ts"),
    `
export const NativeOperationIdentitySchema={parse:v=>v};
export async function withCurrentNativeOperation(expectation,use){
 await Deno.writeTextFile(${
      JSON.stringify(log)
    },JSON.stringify({expectation,use:typeof use}));
 throw Error('PUBLIC_CORE_GATE_REFUSAL');
}`,
  );
  const operation = crypto.randomUUID(),
    owner = join(root, "tasks"),
    base = join(owner, "_generated/course-spec/prairielearn-native");
  await Deno.mkdir(join(base, operation), { recursive: true });
  await Deno.writeTextFile(
    join(base, "active.json"),
    JSON.stringify({ operation }),
  );
  await Deno.writeTextFile(
    join(base, operation, "request.json"),
    JSON.stringify({
      schema: "pl-native-business-request-v1",
      owner,
      identity: {
        operation,
        runtime: "quarto-1.11.5",
        projection: "author",
        profiles: [],
      },
      outputDirectory: join(owner, "_generated/prairielearn-native-render"),
      inputs: [{ source: "index.qmd", captureWitness: crypto.randomUUID() }],
    }),
  );
  const worker = join(root, "worker.ts");
  await Deno.writeTextFile(
    worker,
    `
import {installTsAgent} from ${
      JSON.stringify(
        new URL("./fixtures/performance-agent.ts", import.meta.url).href,
      )
    };
if(Deno.args[1]==='active')installTsAgent({processId:'native-negative',outputDirectory:${
      JSON.stringify(root)
    }});
const Command=Deno.Command;Deno.Command=new Proxy(Command,{construct(){throw Error('UNEXPECTED_NATIVE_CHILD')}});
if(Deno.args[2]==='inspect'){Deno.args.splice(0,Deno.args.length,Deno.args[0],'--instance','fixture');await import(${
      JSON.stringify(
        new URL(
          "../_extensions/course-prairielearn/entrypoints/inspect-grading.ts",
          import.meta.url,
        ).href,
      )
    });}else{
const {nativeEntry}=await import(${
      JSON.stringify(
        new URL(
          "../_extensions/course-prairielearn/application/native-entry.ts",
          import.meta.url,
        ).href,
      )
    });
await nativeEntry({root:Deno.args[0],book:'tasks',instance:'fixture'});}
`,
  );
  for (const boundary of ["native", "inspect"]) {
    for (const state of ["denied-mode", "off", "missing-agent", "active"]) {
      const allowed = state === "denied-mode" ? [] : ["COURSE_PERF_MODE"];
      const r = await new Deno.Command(Deno.execPath(), {
        args: [
          "run",
          "--no-config",
          "--no-lock",
          "--no-check",
          "--no-prompt",
          "--allow-read",
          "--allow-write",
          ...(allowed.length ? [`--allow-env=${allowed.join(",")}`] : []),
          worker,
          root,
          state,
          boundary,
        ],
        env: {
          ...Deno.env.toObject(),
          COURSE_PERF_MODE: state === "off" ? "off" : "summary",
        },
        clearEnv: true,
        stdout: "piped",
        stderr: "piped",
      }).output();
      const stderr = new TextDecoder().decode(r.stderr);
      assert(!r.success);
      assert.match(stderr, /PUBLIC_CORE_GATE_REFUSAL/);
      assert.doesNotMatch(
        stderr,
        /UNEXPECTED_NATIVE_CHILD|Requires env access/,
      );
      const gate = JSON.parse(await Deno.readTextFile(log));
      if (boundary === "inspect") {
        assert.deepEqual(gate, {
          expectation: {
            root: owner,
            profiles: [],
            projection: "author",
            outputDirectory: join(
              owner,
              "_generated/prairielearn-native-render",
            ),
          },
          use: "function",
        });
      } else {assert.deepEqual(gate, {
          request: {
            root: join(root, "tasks"),
            projection: "author",
            outputDirectory: join(
              root,
              "tasks/_generated/prairielearn-native-render",
            ),
          },
          mode: "new",
          prepare: "function",
          use: "function",
        });}
      console.log(
        `PASS ${boundary}/${state}: public Core gate, no native child/full-env read before rejection`,
      );
    }
  }
} finally {
  await Deno.remove(root, { recursive: true });
}
