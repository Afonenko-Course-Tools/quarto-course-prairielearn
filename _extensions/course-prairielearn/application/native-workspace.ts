import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hash, safePath } from "./source-selection.ts";
import { submission } from "./submission.ts";

const trustedModule = join(
  dirname(fileURLToPath(import.meta.url)),
  "trusted-git/build_git_materials.py",
);
const trustedModuleHash =
  "2962ec664db71376a84331489ab15e7d2dfe3e31b2ed0e5e9094ac0eabec7c29";
type File = { name: string; bytes: Uint8Array };
async function ownerFile(root: string, path: string) {
  if (!safePath(path)) {
    throw Error("PL.WORKSPACE_SEED: owner-relative path required");
  }
  let current = root;
  for (const [i, part] of path.split("/").entries()) {
    current = join(current, part);
    const st = await Deno.lstat(current);
    if (
      st.isSymlink ||
      !(i === path.split("/").length - 1 ? st.isFile : st.isDirectory)
    ) throw Error("PL.WORKSPACE_SEED: unsafe owner file");
  }
  return current;
}
/** Узкая production-операция для уже принятого include-git seed_recipe.py.
 * Native operation и его executable PL validator обязан вызвать composition.
 * .git не проходит через общий Core ArtifactInventory.
 */
export async function nativeWorkspaceArtifact(options: {
  root: string;
  project: string;
  settings: unknown;
  materialization: unknown;
  exerciseId: string;
  files: File[];
  zip: (files: File[]) => Uint8Array;
  assertCurrent: () => Promise<void>;
}) {
  if (!options.files.some((f) => f.name === "README.md")) {
    throw Error("PL.WORKSPACE_SEED: full materialized README required");
  }
  const settings = submission(options.settings);
  if (settings.mode !== "workspace") {
    throw Error("PL.WORKSPACE_SEED: Workspace submission required");
  }
  const materialization = options.materialization as any;
  if (
    materialization?.projects?.[options.exerciseId]?.["include-git"] !== true
  ) throw Error("PL.WORKSPACE_SEED: explicit include-git required");
  const declaration = materialization.projects[options.exerciseId];
  if (
    Object.keys(declaration).some((k) =>
      !["include-git", "common-files"].includes(k)
    ) || !Array.isArray(declaration["common-files"]) ||
    declaration["common-files"].length
  ) {
    throw Error(
      "PL.WORKSPACE_SEED: common-files require an explicit native binding",
    );
  }
  const root = await Deno.realPath(options.root);
  const recipe = await ownerFile(root, options.project + "/seed_recipe.py");
  const helperBytes = await Deno.readFile(trustedModule);
  if (await hash(helperBytes) !== trustedModuleHash) {
    throw Error("PL.WORKSPACE_SEED: trusted module changed");
  }
  await options.assertCurrent();
  const stage = await Deno.makeTempDir({ prefix: "pl-native-seed-" });
  try {
    const template = join(stage, "template"), work = join(stage, "work");
    await Deno.mkdir(template);
    const script =
      `import importlib.util,json,sys\nfrom pathlib import Path\nsys.path.insert(0,sys.argv[1])\nspec=importlib.util.spec_from_file_location('course_seed',sys.argv[2]);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)\nprint(json.dumps(module.generate(Path(sys.argv[3]),Path(sys.argv[4])),ensure_ascii=False))\n`;
    const run = await new Deno.Command("python3", {
      args: [
        "-I",
        "-B",
        "-c",
        script,
        dirname(trustedModule),
        recipe,
        work,
        template,
      ],
      env: { PYTHONDONTWRITEBYTECODE: "1" },
      stdout: "piped",
      stderr: "piped",
    }).output();
    if (!run.success) {
      throw Error(
        "PL.WORKSPACE_SEED: recipe failed: " +
          new TextDecoder().decode(run.stderr),
      );
    }
    const identity = JSON.parse(new TextDecoder().decode(run.stdout));
    if (typeof identity.A !== "string" || !/^[a-f0-9]{40}$/.test(identity.A)) {
      throw Error("PL.WORKSPACE_SEED: single A recipe required");
    }
    const git = async (args: string[]) => {
      const env: Record<string, string> = {};
      for (const [k, v] of Object.entries(Deno.env.toObject())) {
        if (!k.startsWith("GIT_")) env[k] = v;
      }
      const run = await new Deno.Command("git", {
        args: ["--no-optional-locks", ...args],
        cwd: work,
        clearEnv: true,
        env: {
          ...env,
          GIT_CONFIG_GLOBAL: "/dev/null",
          GIT_CONFIG_NOSYSTEM: "1",
          GIT_CONFIG_COUNT: "0",
          GIT_OPTIONAL_LOCKS: "0",
        },
        stdout: "piped",
        stderr: "piped",
      }).output();
      if (!run.success) throw Error("PL.WORKSPACE_SEED: invalid Git seed");
      return new TextDecoder().decode(run.stdout).trim();
    };
    if (
      await git(["symbolic-ref", "HEAD"]) !== "refs/heads/main" ||
      await git(["rev-parse", "HEAD"]) !== identity.A ||
      await git(["rev-list", "--all", "--count"]) !== "1" ||
      await git(["status", "--porcelain=v1"]) !== ""
    ) throw Error("PL.WORKSPACE_SEED: initial clean A/main required");
    await git(["fsck", "--strict", "--full", "--no-reflogs"]);
    const all = (await git([
      "cat-file",
      "--batch-all-objects",
      "--batch-check=%(objectname)",
    ])).split("\n").sort();
    const closure =
      (await git(["rev-list", "--objects", "--no-object-names", "HEAD"])).split(
        "\n",
      ).sort();
    if (JSON.stringify(all) !== JSON.stringify(closure)) {
      throw Error("PL.WORKSPACE_SEED: unreachable objects in initial A seed");
    }
    const files = options.files.map((f) => ({
      name: f.name,
      bytes: new Uint8Array(f.bytes),
    })).filter((f) => !f.name.startsWith("work/"));

    async function walk(path: string, prefix: string) {
      for await (const entry of Deno.readDir(path)) {
        const name = prefix + "/" + entry.name, actual = join(path, entry.name);
        if (!safePath(name) || entry.isSymlink) {
          throw Error("PL.WORKSPACE_SEED: unsafe generated file");
        }
        if (entry.isDirectory) await walk(actual, name);
        else if (entry.isFile) {
          files.push({ name, bytes: await Deno.readFile(actual) });
        } else throw Error("PL.WORKSPACE_SEED: special generated file");
      }
    }
    await walk(work, "work");
    for (
      const original of options.files.filter((f) => f.name.startsWith("work/"))
    ) {
      const generated = files.find((f) => f.name === original.name);
      if (
        !generated || await hash(generated.bytes) !== await hash(original.bytes)
      ) {
        throw Error(
          "PL.WORKSPACE_SEED: recipe changes declared starter material",
        );
      }
    }
    files.sort((a, b) => a.name.localeCompare(b.name));
    if (
      new Set(files.map((f) => f.name)).size !== files.length ||
      files.some((f) => !safePath(f.name) || f.name.startsWith(".pl-seed/"))
    ) throw Error("PL.WORKSPACE_SEED: duplicate/service file");
    if (await hash(await Deno.readFile(trustedModule)) !== trustedModuleHash) {
      throw Error("PL.WORKSPACE_SEED: trusted module changed");
    }
    await options.assertCurrent();
    return {
      files,
      archive: options.zip(files),
      initial: identity.A,
      trustedModuleSha256: trustedModuleHash,
    };
  } finally {
    await Deno.remove(stage, { recursive: true });
  }
}
