import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { nativeWorkspaceArtifact } from "../_extensions/course-prairielearn/application/native-workspace.ts";
const sp = Deno.args[0],
  download = Deno.args[1],
  root = await Deno.makeTempDir({ prefix: "pl-common-seed-" }),
  project = "projects/restore";
const { zip } = await import(
  pathToFileURL(join(download, "_extensions/project-download/public.ts")).href
);
const ref = "8c8622d7be5043f32a611717064bc642a346f1e0",
  prefix = "tasks/projects/version-control/restore-selected-state/";
async function original(path: string) {
  const r = await new Deno.Command("git", {
    args: ["-C", sp, "show", ref + ":" + prefix + path],
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!r.success) throw Error(new TextDecoder().decode(r.stderr));
  return r.stdout;
}
async function put(path: string, bytes: Uint8Array) {
  await Deno.mkdir(dirname(join(root, path)), { recursive: true });
  await Deno.writeFile(join(root, path), bytes);
}
for (
  const path of [
    "seed_recipe.py",
    "student/work/README.md",
    "student/work/notes.txt",
  ]
) await put(project + "/" + path, await original(path));
const common = new TextEncoder().encode(
  "Объясните выбранное состояние и сохраните историю.\n",
);
await put("shared/explanation.md", common);
const files = [
  {
    name: "README.md",
    bytes: new TextEncoder().encode("Полное условие самостоятельной работы.\n"),
  },
  { name: "work/README.md", bytes: await original("student/work/README.md") },
  { name: "work/notes.txt", bytes: await original("student/work/notes.txt") },
  { name: "explanation.md", bytes: common },
];
const options = {
  root,
  project,
  exerciseId: "exr-restore",
  settings: {
    mode: "workspace",
    workspaceOptions: {
      image: "fixture.invalid/bounded-only@sha256:" + "0".repeat(64),
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
    projects: {
      "exr-restore": {
        "include-git": true,
        "common-files": [{
          source: "shared/explanation.md",
          target: "student/explanation.md",
          audience: "student",
        }],
      },
    },
  },
  files,
  zip,
  assertCurrent: async () => {},
};
const result = await nativeWorkspaceArtifact(options);
if (
  !result.files.some((f: any) =>
    f.name === "explanation.md" &&
    new TextDecoder().decode(f.bytes).includes("Объясните")
  )
) throw Error("common file lost");
for (
  const [label, mutation] of [["changed-source", async (o: any) => {
    await put("shared/explanation.md", new TextEncoder().encode("tampered"));
  }], ["missing-inventory-target", async (o: any) => {
    o.files = o.files.filter((f: any) => f.name !== "explanation.md");
  }], ["foreign-common-target", async (o: any) => {
    o.materialization.projects["exr-restore"]["common-files"][0].target =
      "student/.git/config";
  }]] as const
) {
  const bad = {
    ...options,
    files: files.map((f) => ({ ...f, bytes: new Uint8Array(f.bytes) })),
    materialization: structuredClone(options.materialization),
  };
  await mutation(bad);
  let error = "";
  try {
    await nativeWorkspaceArtifact(bad);
  } catch (e) {
    error = String(e);
  } finally {
    await put("shared/explanation.md", common);
  }
  if (!error.includes("PL.WORKSPACE_SEED")) {
    throw Error("accepted " + label + " " + error);
  }
}
console.log(JSON.stringify(
  {
    root,
    initial: result.initial,
    commonFiles: 1,
    controls: 3,
    files: result.files.map(({ bytes, ...f }: any) => f),
    limits:
      "Real immutable SP seed recipe with explicit common-file binding; lower-level host fixture only, no OCI/image/portal claim",
  },
  null,
  2,
));
