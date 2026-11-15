import { isDeepStrictEqual } from "node:util";
import {
  captureNativeAuxiliary,
  type NativeAuxiliary,
} from "./native-auxiliary.ts";
import {
  NativeMaterializationSchema,
  NativeSeedTargetSchema,
} from "./native-materialization.ts";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { safePath } from "./source-selection.ts";
import { submission } from "./submission.ts";

const trustedModule = join(
  dirname(fileURLToPath(import.meta.url)),
  "trusted-git/build_git_materials.py",
);
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
    )
      throw Error("PL.WORKSPACE_SEED: unsafe owner file");
  }
  return current;
}
async function verifySeedHistory(
  stdout: Uint8Array,
  auxiliary: NativeAuxiliary,
  work: string,
): Promise<string> {
  const raw: unknown = JSON.parse(new TextDecoder().decode(stdout));
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw Error("PL.WORKSPACE_SEED: invalid recipe identity");
  }
  const identity: Record<string, unknown> = Object.fromEntries(
    Object.entries(raw),
  );
  const sha = (value: unknown): value is string =>
    typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
  const single =
    sha(identity.A) &&
    Object.keys(identity).sort().join() === "A,head,refs,status";
  const pair =
    sha(identity.S0) &&
    sha(identity.S1) &&
    identity.S0 !== identity.S1 &&
    Object.keys(identity).sort().join() === "S0,S1,head,refs,status";
  if (!single && !pair) {
    throw Error("PL.WORKSPACE_SEED: exact A or S0/S1 recipe required");
  }
  const initial = single ? identity.A : identity.S1;
  if (!sha(initial)) throw Error("PL.WORKSPACE_SEED: invalid initial commit");
  // Прежнее исключение GIT_* сохраняется, но только из одного saved map.
  const gitEnvironment = Object.freeze({
    ...Object.fromEntries(
      Object.entries(auxiliary.environment).filter(
        ([key]) => !key.startsWith("GIT_"),
      ),
    ),
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_COUNT: "0",
    GIT_OPTIONAL_LOCKS: "0",
  });
  const git = async (args: string[]) => {
    await auxiliary.before();
    const run = await new Deno.Command("git", {
      args: ["--no-optional-locks", ...args],
      cwd: work,
      clearEnv: true,
      env: { ...gitEnvironment },
      stdout: "piped",
      stderr: "piped",
    }).output();
    await auxiliary.after();
    if (!run.success) throw Error("PL.WORKSPACE_SEED: invalid Git seed");
    return new TextDecoder().decode(run.stdout).trim();
  };
  const head = await git(["symbolic-ref", "HEAD"]);
  const refs = await git(["show-ref"]);
  const status = await git(["status", "--porcelain=v1"]);
  const graph = await git(["rev-list", "--parents", "HEAD"]);
  const parent = identity.S0;
  if (!single && !sha(parent)) {
    throw Error("PL.WORKSPACE_SEED: invalid parent commit");
  }
  const expectedGraph = single
    ? initial
    : initial + " " + parent + "\n" + parent;
  if (
    head !== "refs/heads/main" ||
    (await git(["rev-parse", "HEAD"])) !== initial ||
    refs !== initial + " refs/heads/main" ||
    JSON.stringify(identity.refs) !== JSON.stringify([refs]) ||
    identity.head !== head ||
    identity.status !== status ||
    status !== "" ||
    graph !== expectedGraph ||
    (await git(["rev-list", "--all", "--count"])) !== (single ? "1" : "2")
  ) {
    throw Error("PL.WORKSPACE_SEED: exact initial clean history/main required");
  }
  await git(["fsck", "--strict", "--full", "--no-reflogs"]);
  const all = (
    await git([
      "cat-file",
      "--batch-all-objects",
      "--batch-check=%(objectname)",
    ])
  )
    .split("\n")
    .sort();
  const closure = (
    await git(["rev-list", "--objects", "--no-object-names", "HEAD"])
  )
    .split("\n")
    .sort();
  if (JSON.stringify(all) !== JSON.stringify(closure)) {
    throw Error("PL.WORKSPACE_SEED: unreachable objects in initial seed");
  }
  return initial;
}
/** Узкая production-операция для уже принятого include-git seed_recipe.py.
 * Native operation и его executable PL validator обязан вызвать composition.
 * .git не проходит через общий Core ArtifactFiles.
 */
export async function nativeWorkspaceArtifact(options: {
  root: string;
  project: string;
  settings: unknown;
  materialization: unknown;
  exerciseId: string;
  seedTarget?: unknown;
  files: File[];
  zip: (files: File[]) => Uint8Array;
  assertCurrent: () => Promise<void>;
  auxiliary?: NativeAuxiliary;
}) {
  if (!options.files.some((f) => f.name === "README.md")) {
    throw Error("PL.WORKSPACE_SEED: full materialized README required");
  }
  const settings = submission(options.settings);
  if (!["workspace", "upload"].includes(settings.mode)) {
    throw Error("PL.WORKSPACE_SEED: upload or Workspace submission required");
  }
  let materialization: ReturnType<typeof NativeMaterializationSchema.parse>;
  try {
    materialization = NativeMaterializationSchema.parse(
      options.materialization,
    );
  } catch (error) {
    throw Error("PL.WORKSPACE_SEED: invalid materialization", { cause: error });
  }
  const declaration = materialization.projects[options.exerciseId];
  if (declaration?.["include-git"] !== true)
    throw Error("PL.WORKSPACE_SEED: explicit include-git required");
  const target = NativeSeedTargetSchema.parse(
    options.seedTarget === undefined ? "work" : options.seedTarget,
  );
  if (settings.mode === "workspace" && target !== "work") {
    throw Error("PL.WORKSPACE_SEED: Workspace сохраняет target work");
  }
  const below = (name: string) => name.startsWith(target + "/");
  function paths(files: File[], generated: boolean) {
    const names = files.map((f) => f.name),
      known = new Set(names);
    if (
      known.size !== names.length ||
      names.some(
        (name) =>
          !safePath(name) ||
          name.split("/").includes(".pl-seed") ||
          (!generated && name.split("/").includes(".git")),
      )
    ) {
      throw Error("PL.WORKSPACE_SEED: duplicate/service/unsafe inventory");
    }
    for (const name of names) {
      const parts = name.split("/");
      for (let i = 1; i < parts.length; i++) {
        if (known.has(parts.slice(0, i).join("/"))) {
          throw Error("PL.WORKSPACE_SEED: file/directory prefix collision");
        }
      }
      if (!generated && (name === target || target.startsWith(name + "/"))) {
        throw Error("PL.WORKSPACE_SEED: seed target overlaps inventory file");
      }
    }
  }
  paths(options.files, false);
  const auxiliary =
    options.auxiliary ?? captureNativeAuxiliary(options.assertCurrent);
  const root = await Deno.realPath(options.root);
  await options.assertCurrent();
  const commonTargets = new Set<string>();
  for (const common of declaration["common-files"]) {
    if (common.audience !== "student") continue;
    const target = common.target.slice("student/".length);
    if (commonTargets.has(target) || target.startsWith(".pl-seed/")) {
      throw Error("PL.WORKSPACE_SEED: common target collision");
    }
    commonTargets.add(target);
    const source = await Deno.readFile(await ownerFile(root, common.source));
    const selected = options.files.filter((file) => file.name === target);
    if (
      selected.length !== 1 ||
      !isDeepStrictEqual(source, selected[0]?.bytes)
    ) {
      throw Error(
        "PL.WORKSPACE_SEED: common file lacks exact native inventory binding",
      );
    }
  }
  const recipe = await ownerFile(root, options.project + "/seed_recipe.py");
  await options.assertCurrent();
  const stage = await Deno.makeTempDir({ prefix: "pl-native-seed-" });
  try {
    const template = join(stage, "template"),
      work = join(stage, "work");
    await Deno.mkdir(template);
    const script = `import importlib.util,json,sys\nfrom pathlib import Path\nsys.path.insert(0,sys.argv[1])\nspec=importlib.util.spec_from_file_location('course_seed',sys.argv[2]);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)\nprint(json.dumps(module.generate(Path(sys.argv[3]),Path(sys.argv[4])),ensure_ascii=False))\n`;
    const run = await new Deno.Command("python3", {
      args: [
        "-I",
        "-S",
        "-B",
        "-c",
        script,
        dirname(trustedModule),
        recipe,
        work,
        template,
      ],
      clearEnv: true,
      env: await auxiliary.before({ PYTHONDONTWRITEBYTECODE: "1" }),
      stdout: "piped",
      stderr: "piped",
    }).output();
    await auxiliary.after();
    if (!run.success) {
      throw Error(
        "PL.WORKSPACE_SEED: recipe failed: " +
          new TextDecoder().decode(run.stderr),
      );
    }
    const initial = await verifySeedHistory(run.stdout, auxiliary, work);
    const files = options.files
      .map((f) => ({
        name: f.name,
        bytes: new Uint8Array(f.bytes),
      }))
      .filter((f) => !below(f.name));

    async function walk(path: string, prefix: string) {
      for await (const entry of Deno.readDir(path)) {
        const name = prefix + "/" + entry.name,
          actual = join(path, entry.name);
        if (!safePath(name) || entry.isSymlink) {
          throw Error("PL.WORKSPACE_SEED: unsafe generated file");
        }
        if (entry.isDirectory) await walk(actual, name);
        else if (entry.isFile) {
          files.push({ name, bytes: await Deno.readFile(actual) });
        } else throw Error("PL.WORKSPACE_SEED: special generated file");
      }
    }
    await walk(work, target);
    for (const original of options.files.filter((f) => below(f.name))) {
      const generated = files.find((f) => f.name === original.name);
      if (!generated || !isDeepStrictEqual(generated.bytes, original.bytes)) {
        throw Error(
          "PL.WORKSPACE_SEED: recipe changes declared starter material",
        );
      }
    }
    files.sort((a, b) => a.name.localeCompare(b.name));
    if (
      new Set(files.map((f) => f.name)).size !== files.length ||
      files.some((f) => !safePath(f.name) || f.name.startsWith(".pl-seed/"))
    )
      throw Error("PL.WORKSPACE_SEED: duplicate/service file");
    paths(files, true);
    await options.assertCurrent();
    return {
      files,
      archive: options.zip(files),
      initial,
    };
  } finally {
    await Deno.remove(stage, { recursive: true });
  }
}
