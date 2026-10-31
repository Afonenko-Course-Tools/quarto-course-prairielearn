import { renderPublicBody } from "../_extensions/course-prairielearn/application/export.ts";
import { nativeWorkspaceArtifact } from "../_extensions/course-prairielearn/application/native-workspace.ts";
import { dirname, join } from "node:path";
import { assert, fixture, reject } from "./native-auxiliary-fixtures.ts";
Deno.test("Body отказывает до child при live-fence failure", async () => {
  await reject(
    () =>
      renderPublicBody(
        { apiVersion: [1, 23, 1], resources: [] },
        [{ t: "Para", c: [{ t: "Str", c: "Тест" }] }],
        "fixture",
        {},
        "files",
        "token",
        {
          auxiliary: {
            environment: Deno.env.toObject(),
            before: async () => {
              throw Error("PRE_CHILD_SENTINEL");
            },
            after: async () => {},
          },
        } as any,
      ),
    "PRE_CHILD_SENTINEL",
  );
});
Deno.test("Настоящая SP recipe S0/S1 сохраняет два commit и starter bytes", async () => {
  const f = await fixture("github-ssh");
  try {
    const result = await nativeWorkspaceArtifact(f.options);
    assert(/^[a-f0-9]{40}$/.test(result.initial), "HEAD отсутствует");
    assert(
      result.files.some((f) => f.name === "work/.git/index"),
      "Git index потерян",
    );
  } finally {
    await Deno.remove(f.root, { recursive: true });
  }
});
Deno.test("Python seed отключает site через -I -S -B", async () => {
  const f = await fixture("restore-selected-state", true);
  try {
    await nativeWorkspaceArtifact(f.options);
  } finally {
    await Deno.remove(f.root, { recursive: true });
  }
});

import { captureNativeAuxiliary } from "../_extensions/course-prairielearn/application/native-auxiliary.ts";
const body = (auxiliary?: any) =>
  renderPublicBody(
    { apiVersion: [1, 23, 1], resources: [] },
    [{ t: "Para", c: [{ t: "Str", c: "PUBLIC_C5" }] }],
    "fixture",
    {},
    "files",
    "token",
    { auxiliary },
  );
Deno.test("Native Body clearEnv передаёт полный saved env и неизменный Pandoc stdin/argv", async () => {
  const key = "C5_ENV_SENTINEL",
    previous = Deno.env.get(key),
    Actual = Deno.Command;
  Deno.env.set(key, "полная карта");
  const calls: any[] = [];
  let guards = 0;
  try {
    const auxiliary = captureNativeAuxiliary(async () => {
      guards++;
    });
    (Deno as any).Command = new Proxy(Actual, {
      construct(target, args) {
        calls.push(args);
        return Reflect.construct(target, args);
      },
    });
    const rendered = await body(auxiliary);
    assert(rendered.html.includes("PUBLIC_C5"), "Body bytes потеряны");
    assert(
      calls.length === 1 && calls[0][1].clearEnv === true,
      "clearEnv/число children",
    );
    assert(
      JSON.stringify(calls[0][1].args) ===
        JSON.stringify(["pandoc", "--from=json", "--to=html5", "--mathml"]),
      "argv изменены",
    );
    assert(
      JSON.stringify(calls[0][1].env) === JSON.stringify(auxiliary.environment),
      "Не полная frozen env",
    );
    for (
      const key of ["XDG_CACHE_HOME", "JAVA_HOME", "GRADLE_USER_HOME", "PATH"]
    ) assert(calls[0][1].env[key] === Deno.env.get(key), "Потеря env " + key);
    assert(guards === 2, "Нет pre/post guard");
  } finally {
    (Deno as any).Command = Actual;
    if (previous === undefined) Deno.env.delete(key);
    else Deno.env.set(key, previous);
  }
});
Deno.test("Native env addition/change/removal отвергаются до child и не изменяют snapshot", async () => {
  const key = "C5_PARENT_MUTATION",
    old = Deno.env.get(key),
    Actual = Deno.Command;
  let children = 0;
  try {
    (Deno as any).Command = new Proxy(Actual, {
      construct() {
        children++;
        throw Error("CHILD_ESCAPED");
      },
    });
    for (const mode of ["add", "change", "remove"]) {
      Deno.env.delete(key);
      if (mode !== "add") Deno.env.set(key, "original");
      const aux = captureNativeAuxiliary(async () => {});
      if (mode === "remove") Deno.env.delete(key);
      else Deno.env.set(key, "changed");
      await reject(() => body(aux), "PL.NATIVE_ENV_CHANGED");
    }
    assert(children === 0, "Дрейф запустил child");
  } finally {
    (Deno as any).Command = Actual;
    if (old === undefined) Deno.env.delete(key);
    else Deno.env.set(key, old);
  }
});
Deno.test("Post-child live failure отбрасывает настоящий результат Pandoc", async () => {
  let calls = 0;
  const aux = captureNativeAuxiliary(async () => {
    if (++calls === 2) throw Error("POST_CHILD_DRIFT");
  });
  await reject(() => body(aux), "POST_CHILD_DRIFT");
  assert(calls === 2, "Post fence не достигнут");
});
Deno.test("Python и каждый C Git child используют один saved env/pre-post guards", async () => {
  const f = await fixture("restore-selected-state"),
    Actual = Deno.Command,
    calls: any[] = [];
  let guards = 0;
  try {
    const auxiliary = captureNativeAuxiliary(async () => {
      guards++;
    });
    (Deno as any).Command = new Proxy(Actual, {
      construct(target, args) {
        calls.push(args);
        return Reflect.construct(target, args);
      },
    });
    await nativeWorkspaceArtifact({ ...f.options, auxiliary });
    assert(
      calls[0][0] === "python3" &&
        JSON.stringify(calls[0][1].args.slice(0, 3)) === '["-I","-S","-B"]',
      "Python argv",
    );
    assert(
      calls.length > 8 && calls.slice(1).every((c) => c[0] === "git"),
      "C Git chain отсутствует",
    );
    for (const c of calls) {
      assert(c[1].clearEnv === true, "ambient child");
      for (const [k, v] of Object.entries(auxiliary.environment)) {
        if (!k.startsWith("GIT_") && k !== "PYTHONDONTWRITEBYTECODE") {
          assert(c[1].env[k] === v, "Потеря env " + k);
        }
      }
    }
    assert(guards === calls.length * 2, "Не каждый child fenced");
  } finally {
    (Deno as any).Command = Actual;
    await Deno.remove(f.root, { recursive: true });
  }
});
Deno.test("Recipe identity/refs/graph/index/private objects остаются закрытыми", async () => {
  const mutations = [
    "identity['A']='0'*40",
    "identity['extra']='unexpected'",
    "identity['head']='refs/heads/foreign'",
    "identity['refs']=[]",
    "git(destination,'branch','extra')",
    "git(destination,'checkout','--detach')",
    "git(destination,'hash-object','-w','--stdin',input=b'PRIVATE_UNREACHABLE')",
    "(destination/'notes.txt').write_text('DRIFT')",
    "git(destination,'update-index','--cacheinfo','120000,'+git(destination,'rev-parse','HEAD:README.md').decode().strip()+',README.md')",
  ];
  for (const mutation of mutations) {
    const f = await fixture("restore-selected-state");
    try {
      const path = join(f.root, f.options.project, "seed_recipe.py"),
        source = await Deno.readTextFile(path);
      await Deno.writeTextFile(
        path,
        source +
          "\nfrom build_git_materials import git\n_original_generate=generate\ndef generate(destination,empty_template):\n identity=_original_generate(destination,empty_template)\n " +
          mutation + "\n return identity\n",
      );
      await reject(
        () => nativeWorkspaceArtifact(f.options),
        "PL.WORKSPACE_SEED",
      );
    } finally {
      await Deno.remove(f.root, { recursive: true });
    }
  }
});
Deno.test("A recipe positive без изменённого seed и post-Python refusal не выпускает archive", async () => {
  const f = await fixture("restore-selected-state");
  try {
    const clean = await nativeWorkspaceArtifact(f.options);
    assert(
      clean.files.some((f) => f.name === "work/notes.txt"),
      "A starter lost",
    );
    let fences = 0, zips = 0;
    const auxiliary = captureNativeAuxiliary(async () => {
      if (++fences === 2) throw Error("POST_PYTHON_DRIFT");
    });
    await reject(
      () =>
        nativeWorkspaceArtifact({
          ...f.options,
          auxiliary,
          zip: () => {
            zips++;
            return new Uint8Array();
          },
        }),
      "POST_PYTHON_DRIFT",
    );
    assert(zips === 0, "archive принят после drift");
  } finally {
    await Deno.remove(f.root, { recursive: true });
  }
});

Deno.test("C Git сохраняет прежнее исключение ambient GIT_* из saved map", async () => {
  const f = await fixture("restore-selected-state"),
    old = Deno.env.get("GIT_DIR");
  try {
    Deno.env.set("GIT_DIR", f.root + "/foreign-not-repository");
    await nativeWorkspaceArtifact(f.options);
  } finally {
    if (old === undefined) Deno.env.delete("GIT_DIR");
    else Deno.env.set("GIT_DIR", old);
    await Deno.remove(f.root, { recursive: true });
  }
});
Deno.test("Python -I допускает site в собственном venv, -I -S -B исключает его", async () => {
  const root = await Deno.makeTempDir({ prefix: "pl-c5-python-site-" });
  async function run(executable: string, args: string[]) {
    const r = await new Deno.Command(executable, {
      args,
      clearEnv: true,
      env: Deno.env.toObject(),
      stdout: "piped",
      stderr: "piped",
    }).output();
    assert(r.success, new TextDecoder().decode(r.stderr));
    return new TextDecoder().decode(r.stdout).trim();
  }
  try {
    await run("python3", [
      "-I",
      "-S",
      "-B",
      "-m",
      "venv",
      "--without-pip",
      root + "/venv",
    ]);
    const python = root + "/venv/bin/python3",
      site = await run(python, [
        "-I",
        "-B",
        "-c",
        "import sysconfig; print(sysconfig.get_path('purelib'))",
      ]),
      sentinel = root + "/SITE_EXECUTED";
    await Deno.writeTextFile(
      site + "/sitecustomize.py",
      "from pathlib import Path\nPath(" + JSON.stringify(sentinel) +
        ").write_text('site-loaded')\n",
    );
    await run(python, ["-I", "-B", "-c", "pass"]);
    assert(
      await Deno.readTextFile(sentinel) === "site-loaded",
      "Контроль site не был выполнен",
    );
    await Deno.remove(sentinel);
    await run(python, [
      "-I",
      "-S",
      "-B",
      "-c",
      "import sys; assert sys.flags.no_site",
    ]);
    assert(
      !await Deno.stat(sentinel).then(() => true, () => false),
      "-S выполнил site",
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("Настоящая github recipe сохраняет authored upload mode с include-git", async () => {
  const f = await fixture("github-ssh");
  try {
    await nativeWorkspaceArtifact({
      ...f.options,
      settings: { mode: "upload" },
    });
  } finally {
    await Deno.remove(f.root, { recursive: true });
  }
});
