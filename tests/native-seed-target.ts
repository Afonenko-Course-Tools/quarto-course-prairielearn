import { nativeWorkspaceArtifact } from "../_extensions/course-prairielearn/application/native-workspace.ts";
import { hash } from "../_extensions/course-prairielearn/application/source-selection.ts";
import { workspaceSeed } from "../_extensions/course-prairielearn/application/workspace-seed.ts";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
const [sp, download, output] = Deno.args;
if (!sp || !download || !output) {
  throw Error("Требуются exact SP, Download и собственный output");
}
const { zip } = await import(
  pathToFileURL(join(download, "_extensions/project-download/public.ts")).href
);
await Deno.mkdir(output, { recursive: true });
const results: any[] = [];
const originalCommand = Deno.Command, commands: any[] = [];
(Deno as any).Command = new Proxy(originalCommand, {
  construct(t, a: any[]) {
    commands.push({
      executable: a[0],
      args: a[1].args,
      cwd: a[1].cwd,
      clearEnv: a[1].clearEnv,
    });
    return Reflect.construct(t, a);
  },
});
for (
  const [recipe, mode, target] of [[
    "github-ssh",
    "upload",
    "versioning/project",
  ], ["restore-selected-state", "workspace", "work"]]
) {
  const root = await Deno.makeTempDir({ prefix: "pl-seed-target-" }),
    project = "projects/seed",
    source = join(sp, "tasks/projects/version-control", recipe),
    bindings: any[] = [];
  for (
    const p of recipe === "github-ssh"
      ? ["seed_recipe.py", "seed.json", "student/README.md"]
      : ["seed_recipe.py", "student/work/README.md", "student/work/notes.txt"]
  ) {
    const bytes = await Deno.readFile(join(source, p)),
      to = join(root, project, p);
    await Deno.mkdir(dirname(to), { recursive: true });
    await Deno.writeFile(to, bytes);
    bindings.push({ path: p, sha256: await hash(bytes) });
  }
  let guards = 0, zipCalls = 0;
  async function current() {
    guards++;
    for (const b of bindings) {
      if (
        await hash(await Deno.readFile(join(root, project, b.path))) !==
          b.sha256
      ) throw Error("FIXTURE_CURRENTNESS_CHANGED");
    }
  }
  const readme = {
    name: "README.md",
    bytes: await Deno.readFile(join(source, "student/README.md")).catch(() =>
      new TextEncoder().encode("Полное условие собственного bounded harness.")
    ),
  };
  const files = [
    readme,
    ...(recipe === "restore-selected-state"
      ? await Promise.all(
        ["README.md", "notes.txt"].map(async (p) => ({
          name: "work/" + p,
          bytes: await Deno.readFile(join(source, "student/work", p)),
        })),
      )
      : []),
    {
      name: target + "-neighbor/keep.txt",
      bytes: new TextEncoder().encode("KEEP"),
    },
  ];
  const options: any = {
    root,
    project,
    seedTarget: target,
    exerciseId: "exr-seed",
    settings: mode === "upload" ? { mode: "upload" } : {
      mode: "workspace",
      workspaceOptions: {
        image: "fixture.invalid/unused@sha256:" + "0".repeat(64),
        home: "/workspace",
        port: 8080,
        gradedFiles: [
          "work/**",
          "work/.git/**",
          "work/.*",
          "explanation.m[d]",
          ".pl-seed/identity.jso[n]",
        ],
      },
    },
    materialization: {
      projects: { "exr-seed": { "include-git": true, "common-files": [] } },
    },
    files,
    zip: (files: any[]) => {
      zipCalls++;
      return zip(files);
    },
    assertCurrent: current,
  };
  const positive = await nativeWorkspaceArtifact(options);
  if (
    !positive.files.some((f) => f.name === target + "/.git/HEAD") ||
    !positive.files.some((f) => f.name === target + "-neighbor/keep.txt") ||
    target !== "work" && positive.files.some((f) => f.name.startsWith("work/"))
  ) throw Error("Target prefix/соседний target изменены");
  await Deno.writeFile(join(output, recipe + ".zip"), positive.archive);
  if (mode === "workspace") await workspaceSeed(positive);
  let rejects = 0;
  async function refuse(label: string, change: (o: any) => void) {
    const o = {
      ...options,
      files: files.map((f) => ({ ...f, bytes: new Uint8Array(f.bytes) })),
      materialization: structuredClone(options.materialization),
    };
    change(o);
    const before = zipCalls;
    let error = "";
    try {
      await nativeWorkspaceArtifact(o);
    } catch (e) {
      error = String(e);
    }
    if (!error || zipCalls !== before) {
      throw Error("Не отказал до zip: " + label);
    }
    rejects++;
  }
  await refuse(
    "ancestor collision",
    (o) =>
      o.files.push({ name: target.split("/")[0], bytes: new Uint8Array() }),
  );
  await refuse(
    "file-prefix collision",
    (o) => o.files.push({ name: "README.md/escape", bytes: new Uint8Array() }),
  );
  await refuse(
    "artifact escape",
    (o) => o.files.push({ name: "../escape", bytes: new Uint8Array() }),
  );
  await refuse(
    "git injected",
    (o) =>
      o.files.push({ name: target + "/.git/config", bytes: new Uint8Array() }),
  );
  await refuse(
    "service injected",
    (o) =>
      o.files.push({ name: ".pl-seed/identity.json", bytes: new Uint8Array() }),
  );
  await refuse(
    "recipe bytes mismatch",
    (o) =>
      o.files.push({
        name: target + "/catalog.tsv",
        bytes: new TextEncoder().encode("WRONG"),
      }),
  );
  await refuse(
    "missing include-git",
    (o) => o.materialization.projects["exr-seed"]["include-git"] = false,
  );
  await refuse("currentness", (o) =>
    o.assertCurrent = async () => {
      throw Error("CURRENTNESS_SENTINEL");
    });
  if (mode === "workspace") {
    await refuse("non-work workspace", (o) => o.seedTarget = "another/repo");
  }
  const altered = join(root, project, bindings[0].path),
    before = await Deno.readFile(altered);
  await Deno.writeTextFile(altered, "SOURCE_CHANGED");
  await refuse("changed source", () => {});
  await Deno.writeFile(altered, before);
  results.push({
    recipe,
    mode,
    target,
    initial: positive.initial,
    archiveSha256: await hash(positive.archive),
    files: positive.files.map((f) => f.name),
    rejects,
    guards,
    zipCalls,
    sourceBindings: bindings,
    scope:
      "real immutable recipe and ordinary C ZIP, synthetic inventory/config, NOT A1/assignment/P",
  });
  await Deno.remove(root, { recursive: true });
}
await Deno.writeTextFile(
  join(output, "results.json"),
  JSON.stringify(results, null, 2) + "\n",
);
await Deno.writeTextFile(
  join(output, "commands.json"),
  JSON.stringify(commands, null, 2) + "\n",
);
(Deno as any).Command = originalCommand;
console.log(JSON.stringify(results));
