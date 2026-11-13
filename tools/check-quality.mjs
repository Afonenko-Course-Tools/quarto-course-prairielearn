// Адаптер фактического Deno graph к стандартному typed ESLint.
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import ts from "typescript";
import tseslint from "typescript-eslint";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ESLint } from "eslint";
import { scope } from "../eslint.config.mjs";
/** @typedef {{specifier: string}} GraphTarget */
/** @typedef {{specifier: string, type?: GraphTarget, code?: GraphTarget}} GraphDependency */
/** @typedef {{specifier: string, local?: string, mediaType?: string, error?: unknown, dependencies?: GraphDependency[]}} GraphModule */
/** @typedef {{modules: GraphModule[], redirects: Record<string, string>}} DenoGraph */
/** @param {unknown} value @returns {value is Record<string, unknown>} */
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
/** @param {unknown} value @returns {value is GraphTarget} */
function graphTarget(value) {
  return record(value) && typeof value.specifier === "string";
}
/** @param {unknown} value @returns {value is GraphDependency} */
function graphDependency(value) {
  return (
    record(value) &&
    typeof value.specifier === "string" &&
    (value.type === undefined || graphTarget(value.type)) &&
    (value.code === undefined || graphTarget(value.code))
  );
}
/** @param {unknown} value @returns {value is GraphModule} */
function graphModule(value) {
  return (
    record(value) &&
    typeof value.specifier === "string" &&
    (value.local === undefined || typeof value.local === "string") &&
    (value.mediaType === undefined || typeof value.mediaType === "string") &&
    (value.dependencies === undefined ||
      (Array.isArray(value.dependencies) &&
        value.dependencies.every(graphDependency)))
  );
}
/** @param {unknown} value @returns {value is DenoGraph} */
function denoGraph(value) {
  return (
    record(value) &&
    Array.isArray(value.modules) &&
    value.modules.every(graphModule) &&
    record(value.redirects) &&
    Object.values(value.redirects).every((target) => typeof target === "string")
  );
}
const root = dirname(dirname(fileURLToPath(import.meta.url)));
process.chdir(root);
/** @param {string} bin @param {string[]} args */
const run = (bin, args) =>
  execFileSync(bin, args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
const temporary = mkdtempSync(join(tmpdir(), "course-quality-"));
try {
  const tracked = run("git", [
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "-z",
  ]).split("\0");
  const ownFiles = [...new Set(tracked)]
    .filter(
      (file) =>
        file &&
        existsSync(file) &&
        !/(^|\/)(vendor|node_modules|generated|_generated|\.git|\.quarto|_site|_output|_book)(\/|$)/.test(
          file,
        ) &&
        !file.startsWith(".ci-deps/") &&
        !file.startsWith(".ci/") &&
        !/^examples\/.*\/_extensions\//.test(file),
    )
    .sort();
  const sourceFiles = ownFiles
    .filter(
      (file) =>
        scope.some((prefix) => file.startsWith(prefix)) &&
        /\.(?:ts|js|mjs|cjs)$/.test(file) &&
        !/(^|\/)(vendor|node_modules|generated|_generated)(\/|$)/.test(file) &&
        existsSync(file),
    )
    .sort()
    .map((file) => resolve(file));
  // native-validators.js — генерируемый standalone AJV artifact; проверяется воспроизводимостью и потребляющим .d.ts.
  const generated = new Set(
    ["_extensions/course-prairielearn/application/native-validators.js"].map(
      (file) => resolve(file),
    ),
  );
  const files = sourceFiles.filter(
    (file) => file.endsWith(".ts") && !file.endsWith(".d.ts"),
  );
  const javascriptFiles = sourceFiles.filter(
    (file) => !file.endsWith(".ts") && !generated.has(file),
  );
  if (!files.length)
    throw Error(
      "Quality scope пуст: проверка без собственного production-кода запрещена",
    );
  const denoConfig = JSON.parse(
    readFileSync(
      scope[0].startsWith("src/") ? "deno.json" : "typecheck/deno.json",
      "utf8",
    ),
  );
  if (denoConfig.compilerOptions?.strict !== true)
    throw Error("Quality gate требует strict: true");
  const imports = { ...(denoConfig.imports ?? {}) };
  if (!scope[0].startsWith("src/")) {
    const share = run(process.env.QUARTO ?? "quarto", ["--paths"])
      .trim()
      .split("\n")
      .at(-1);
    if (!share) throw Error("Quarto не вернул share path");
    const quarto = JSON.parse(
      readFileSync(join(share, "deno_std/run_import_map.json"), "utf8"),
    );
    for (const name of ["stdlib/path", "stdlib/fs"])
      imports[name] = quarto.imports[name].replace("jsr:/", "jsr:");
    const siblings = dirname(root);
    imports["course-performance/"] = pathToFileURL(
      resolve(
        process.env.COURSE_PERFORMANCE_SOURCE ??
          process.env.PERFORMANCE ??
          join(siblings, "quarto-course-performance"),
      ) + "/",
    ).href;
    const providers = new Map();
    const namespaces = new Set();
    for (const [name, variable, repo] of [
      ["course-core", "CORE", "quarto-course"],
      ["course-navigation", "CORE", "quarto-course"],
      ["course-prairielearn", "PL", "quarto-course-prairielearn"],
      ["reference-catalog", "QRC", "quarto-reference-catalog"],
      ["project-download", "DOWNLOAD", "quarto-project-download"],
      ["course-site", "SITE", "quarto-project-publish"],
    ]) {
      const source = process.env[variable] ?? join(siblings, repo);
      const extension = [
        join(source, "_extensions", name),
        join(source, "_extensions/Afonenko-Course-Tools", name),
        source,
      ].find((path) => existsSync(join(path, "public.ts")));
      if (!extension) continue;
      const target = pathToFileURL(resolve(extension) + "/").href;
      imports[name + "/"] = target;
      providers.set(name, target);
      namespaces.add(dirname(resolve(extension)));
      if (name === "course-prairielearn")
        imports["pl-native/"] = new URL("application/", target).href;
    }
    for (const namespace of namespaces)
      for (const [name, target] of providers) {
        imports[pathToFileURL(join(namespace, name) + "/").href] = target;
      }
  }
  let importMap = process.argv
    .slice(2)
    .find((argument) => !argument.startsWith("--"));
  if (importMap)
    Object.assign(
      imports,
      JSON.parse(readFileSync(resolve(importMap), "utf8")).imports,
    );
  const configPath = join(temporary, "deno.json");
  writeFileSync(configPath, JSON.stringify({ ...denoConfig, imports }));
  const entry = join(temporary, "entry.ts");
  writeFileSync(
    entry,
    files
      .map((file) => `import ${JSON.stringify(pathToFileURL(file).href)};`)
      .join("\n"),
  );
  /** @type {unknown} */
  const graph = JSON.parse(
    run("deno", ["info", "--no-lock", "--config", configPath, "--json", entry]),
  );
  if (!denoGraph(graph)) throw Error("Deno info вернул неверный graph");
  const errors = graph.modules.filter((module) => module.error);
  if (errors.length) throw Error(JSON.stringify(errors));
  const byUrl = new Map(
    graph.modules.map((module) => [module.specifier, module]),
  );
  const byFile = new Map(
    graph.modules
      .filter((module) => module.local)
      .map((module) => [module.local, module]),
  );
  const options = {
    ...ts.convertCompilerOptionsFromJson(denoConfig.compilerOptions, root)
      .options,
    noEmit: true,
    allowImportingTsExtensions: true,
    allowJs: true,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ESNext,
    skipLibCheck: true,
    types: ["node"],
    typeRoots: [join(root, "node_modules/@types")],
  };
  const globals = join(temporary, "deno.d.ts");
  // `deno types` уже объединяет эти библиотеки; TS не знает имён встроенных Deno libs.
  writeFileSync(
    globals,
    run("deno", ["types"]).replace(
      /^\/\/\/ <reference lib="(?:deno\.[^"]*|node)" \/>\r?\n/gm,
      "",
    ),
  );
  const host = ts.createCompilerHost(options);
  host.resolveModuleNames = (names, containing) =>
    names.map((name) => {
      const dep = byFile
        .get(containing)
        ?.dependencies?.find((item) => item.specifier === name);
      let url = dep?.type?.specifier ?? dep?.code?.specifier;
      while (url && graph.redirects[url]) url = graph.redirects[url];
      const module = byUrl.get(url ?? "");
      return module?.local
        ? {
            resolvedFileName: module.local,
            extension:
              module.mediaType === "JavaScript"
                ? ts.Extension.Js
                : ts.Extension.Ts,
          }
        : ts.resolveModuleName(name, containing, options, host).resolvedModule;
    });
  const program = ts.createProgram([...files, globals], options, host);
  const programs = [program];
  if (javascriptFiles.length) {
    const browserConfig = join(
      root,
      "typecheck",
      existsSync(join(root, "typecheck/javascript.json"))
        ? "javascript.json"
        : "browser.json",
    );
    const settings = JSON.parse(readFileSync(browserConfig, "utf8"));
    if (
      settings.compilerOptions?.strict !== true ||
      settings.compilerOptions?.checkJs !== true
    )
      throw Error(
        "JavaScript quality gate требует strict: true и checkJs: true",
      );
    const jsOptions = {
      ...ts.convertCompilerOptionsFromJson(
        settings.compilerOptions,
        dirname(browserConfig),
      ).options,
      strict: true,
      allowJs: true,
      checkJs: true,
      noEmit: true,
      skipLibCheck: true,
      typeRoots: [join(root, "node_modules/@types")],
    };
    const declarations = join(root, "typecheck/browser.d.ts");
    programs.push(
      ts.createProgram(
        [
          ...javascriptFiles,
          ...(existsSync(declarations) ? [declarations] : []),
        ],
        jsOptions,
      ),
    );
  }
  const checkedFiles = [...files, ...javascriptFiles];
  const diagnostics = programs
    .flatMap((program) => ts.getPreEmitDiagnostics(program))
    .filter((item) => !item.file || checkedFiles.includes(item.file.fileName));
  if (diagnostics.length)
    throw Error(
      ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCurrentDirectory: () => root,
        getCanonicalFileName: (file) => file,
        getNewLine: () => "\n",
      }),
    );
  const eslint = new ESLint({
    overrideConfig: [{ languageOptions: { parserOptions: { programs } } }],
  });
  const results = await eslint.lintFiles(checkedFiles);
  console.log(await (await eslint.loadFormatter("stylish")).format(results));
  if (
    results.length !== checkedFiles.length ||
    results.some((result) => result.warningCount)
  )
    throw Error("Неполный quality scope либо предупреждения линтера");
  const configured = await Promise.all(
    checkedFiles.map((file) => eslint.calculateConfigForFile(file)),
  );
  const requiredRules = [
    "no-explicit-any",
    "ban-ts-comment",
    "no-unsafe-type-assertion",
    "no-unsafe-assignment",
    "no-unsafe-argument",
    "no-unsafe-call",
    "no-unsafe-member-access",
    "no-unsafe-return",
    "switch-exhaustiveness-check",
  ];
  for (const [index, config] of configured.entries()) {
    const expectedParams = checkedFiles[index].endsWith(
      "/application/public-body-render.ts",
    )
      ? 7
      : 5;
    if (
      config?.linterOptions.noInlineConfig !== true ||
      requiredRules.some(
        (rule) => config.rules["@typescript-eslint/" + rule]?.[0] !== 2,
      ) ||
      config.rules.complexity?.[0] !== 2 ||
      config.rules.complexity?.[1] !== 30 ||
      config.rules["max-depth"]?.[0] !== 2 ||
      config.rules["max-depth"]?.[1] !== 5 ||
      config.rules["max-params"]?.[0] !== 2 ||
      config.rules["max-params"]?.[1] !== expectedParams
    ) {
      throw Error("Неполная ESLint config: " + checkedFiles[index]);
    }
  }
  const parser = tseslint.parser;
  if (
    !("meta" in parser) ||
    !record(parser.meta) ||
    typeof parser.meta.version !== "string"
  )
    throw Error("Parser не вернул версию");
  const parserVersion = parser.meta.version;
  let receipt;
  if (results.some((result) => result.errorCount)) process.exitCode = 1;
  else {
    receipt = {
      checked: files.length,
      javascriptChecked: javascriptFiles.length,
      structuralChecked: configured.filter(
        (config) => config.rules.complexity?.[0] === 2,
      ).length,
      strict: true,
      typescript: ts.version,
      eslint: ESLint.version,
      typescriptESLint: parserVersion,
      graphModules: graph.modules.length,
    };
  }
  console.log(
    run(join(root, "node_modules/.bin/depcruise"), [
      "--config",
      ".dependency-cruiser.json",
      "--output-type",
      "err-long",
      ...scope.map((prefix) => prefix.replace(/\/$/, "")),
    ]),
  );
  if (process.exitCode) throw Error("Typed ESLint не прошёл");
  console.log(
    run(join(root, "node_modules/.bin/tsc"), [
      "--project",
      "tsconfig.tools.json",
      "--pretty",
      "false",
    ]),
  );
  // Один владелец формата: Prettier, Ruff, StyLua и shfmt по своему языку.
  // Закреплённые исходные байты SP и upstream schemas проверяются существующим provenance gate.
  /** @param {string} file */
  const pinned = (file) =>
    file.startsWith("tests/fixtures/git-recipes/") ||
    file.startsWith(
      "_extensions/course-prairielearn/application/trusted-git/",
    ) ||
    file.startsWith("_extensions/course-prairielearn/spec/upstream/") ||
    /\/native-validators\.(?:js|d\.ts)$/.test(file);
  const formatted = ownFiles.filter(
    (file) =>
      !pinned(file) && !/\/observability\/bridge\.(?:ts|lua)$/.test(file),
  );
  const prettier = formatted.filter((file) =>
    /\.(?:ts|js|mjs|cjs|json|ya?ml|md)$/.test(file),
  );
  const python = ownFiles.filter(
    (file) => file.endsWith(".py") && !pinned(file),
  );
  const lua = ownFiles.filter((file) => file.endsWith(".lua"));
  const shell = formatted.filter((file) => file.endsWith(".sh"));
  const yaml = ownFiles.filter(
    (file) => /\.ya?ml$/.test(file) && !pinned(file),
  );
  const workflows = yaml.filter((file) =>
    file.startsWith(".github/workflows/"),
  );
  for (const file of ownFiles.filter((file) => /\.(?:mjs|cjs)$/.test(file)))
    run(process.execPath, ["--check", file]);
  console.log(run("prettier", ["--check", ...prettier]));
  if (python.length) {
    console.log(run("ruff", ["format", "--check", ...python]));
    console.log(run("ruff", ["check", ...python]));
  }
  const pythonTypes = ownFiles.filter(
    (file) =>
      file.endsWith(".py") && !file.startsWith("tests/fixtures/git-recipes/"),
  );
  console.log(
    run("pyright", [
      "--project",
      "pyrightconfig.json",
      "--warnings",
      ...pythonTypes,
    ]),
  );
  if (lua.length) {
    console.log(run("stylua", ["--check", ...lua]));
    console.log(run("luacheck", ["--codes", "--no-color", ...lua]));
    const performance =
      process.env.COURSE_PERFORMANCE_SOURCE ?? process.env.PERFORMANCE;
    if (!performance)
      throw Error(
        "Для LuaLS задайте COURSE_PERFORMANCE_SOURCE или PERFORMANCE",
      );
    console.log(
      run("quarto", [
        "run",
        join(performance, "tools/check-lua.ts"),
        "--root",
        root,
        "--server",
        resolve(
          process.env.LUA_LANGUAGE_SERVER ??
            run("which", ["lua-language-server"]).trim(),
        ),
        "--scope",
        "_extensions/course-prairielearn",
        "--exclude",
        "_extensions/course-prairielearn/vendor",
      ]),
    );
  }
  if (shell.length) {
    console.log(run("shfmt", ["-d", "-i", "2", "-ci", ...shell]));
    console.log(
      run("shellcheck", [
        "--norc",
        "--enable=all",
        "--severity=style",
        ...shell,
      ]),
    );
  }
  if (yaml.length)
    console.log(
      run("yamllint", ["--strict", "--config-file", ".yamllint.yml", ...yaml]),
    );
  if (workflows.length) console.log(run("actionlint", workflows));
  console.log(
    JSON.stringify({
      ...receipt,
      formatted: prettier.length,
      python: python.length,
      lua: lua.length,
      shell: shell.length,
      yaml: yaml.length,
      workflows: workflows.length,
    }),
  );
} catch (error) {
  if (error instanceof Error) {
    if ("stdout" in error) console.error(String(error.stdout));
    if ("stderr" in error) console.error(String(error.stderr));
  }
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
