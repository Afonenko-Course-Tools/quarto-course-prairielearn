import { dirname, join } from "node:path";
const sp =
  "/home/tolya/Java/.cache/codex-tools/refactoring-execution/repos/system-practice-root-metadata-20261031";
function assert(v: unknown, text: string): asserts v {
  if (!v) throw Error(text);
}
async function reject(f: () => Promise<unknown>, text: string) {
  let error = "";
  try {
    await f();
  } catch (e) {
    error = String(e);
  }
  assert(
    error.includes(text),
    "Ожидался отказ " + text + ", получено: " + error,
  );
}
async function fixture(name: string, noSite = false) {
  const root = await Deno.makeTempDir({ prefix: "pl-c5-seed-" }),
    project = "projects/" + name;
  async function original(path: string) {
    const r = await new Deno.Command("git", {
      args: [
        "-C",
        sp,
        "show",
        "9807379deadaaabccb0ee7de81e77846f0e960a1:tasks/projects/version-control/" +
        name + "/" + path,
      ],
      stdout: "piped",
      stderr: "piped",
    }).output();
    assert(r.success, new TextDecoder().decode(r.stderr));
    return r.stdout;
  }
  const paths = name === "github-ssh"
    ? ["seed_recipe.py", "seed.json"]
    : ["seed_recipe.py", "student/work/README.md", "student/work/notes.txt"];
  for (const path of paths) {
    const to = join(root, project, path);
    await Deno.mkdir(dirname(to), { recursive: true });
    let bytes = await original(path);
    if (path === "seed_recipe.py" && noSite) {
      bytes = new TextEncoder().encode(
        "import sys\nassert sys.flags.no_site == 1, 'PYTHON_SITE_LOADED'\n" +
          new TextDecoder().decode(bytes),
      );
    }
    await Deno.writeFile(to, bytes);
  }
  const files = [
    { name: "README.md", bytes: new TextEncoder().encode("Полное условие.") },
    ...await Promise.all(
      paths.filter((p) => p.startsWith("student/")).map(async (p) => ({
        name: p.slice(8),
        bytes: await original(p),
      })),
    ),
  ];
  const options = {
    root,
    project,
    exerciseId: "exr-seed",
    settings: {
      mode: "workspace",
      workspaceOptions: {
        image: "fixture.invalid/synthetic@sha256:" + "0".repeat(64),
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
    zip: () => new Uint8Array(),
    assertCurrent: async () => {},
  };
  return { root, options };
}

export { assert, fixture, reject };
