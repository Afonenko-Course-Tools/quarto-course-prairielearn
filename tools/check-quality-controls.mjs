// Проверяет правила штатной командой на новых production-файлах; исходники всегда удаляются.
import { execFileSync } from "node:child_process";
import {
  existsSync,
  writeFileSync,
  unlinkSync,
  readFileSync,
  mkdtempSync,
  rmSync,
  chmodSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scope } from "../eslint.config.mjs";
const root = dirname(dirname(fileURLToPath(import.meta.url)));
/** @type {string[]} */
const files = [];
/** @param {Record<string, string | undefined>} environment */
function run(environment = {}) {
  try {
    return {
      status: 0,
      output: execFileSync(
        process.execPath,
        ["tools/check-quality.mjs", ...process.argv.slice(2)],
        {
          cwd: root,
          env: { ...process.env, ...environment },
          encoding: "utf8",
          stdio: "pipe",
          maxBuffer: 32 * 1024 * 1024,
        },
      ),
    };
  } catch (error) {
    return {
      status:
        error instanceof Error &&
        "status" in error &&
        typeof error.status === "number"
          ? error.status
          : 1,
      output:
        error instanceof Error
          ? ("stdout" in error ? String(error.stdout) : "") +
            ("stderr" in error ? String(error.stderr) : "") +
            error.message
          : String(error),
    };
  }
}
/** @param {string} path @param {string} source */
function put(path, source, format = true) {
  const file = join(root, path);
  if (existsSync(file)) throw Error("Контрольный путь уже занят: " + file);
  if (format && /\.(?:ts|js|mjs|cjs|json|ya?ml|md)$/.test(file)) {
    try {
      source = execFileSync("prettier", ["--stdin-filepath", file], {
        input: source,
        encoding: "utf8",
        stdio: "pipe",
      });
    } catch {
      /* malformed AST остаётся входом настоящего production gate. */
    }
  }
  writeFileSync(file, source);
  files.push(file);
}
function clean() {
  for (const file of files.splice(0)) unlinkSync(file);
}
const cases = [
  ["no-explicit-any", "export const explicit: any = 1;"],
  ["ban-ts-comment", "// @ts-ignore\nexport const ignored = 1;"],
  [
    "no-unsafe-type-assertion",
    "export const narrowed = ({} as unknown) as string;",
  ],
  ["no-unsafe-assignment", `export const assigned: string = JSON.parse('{}');`],
  [
    "no-unsafe-argument",
    `function consume(value: string): string { return value; } export const argument = consume(JSON.parse('{}'));`,
  ],
  ["no-unsafe-call", `export const called: unknown = JSON.parse('{}')();`],
  [
    "no-unsafe-member-access",
    `export const member: unknown = JSON.parse('{}').field;`,
  ],
  [
    "no-unsafe-return",
    `export function returned(): string { return JSON.parse('{}'); }`,
  ],
  [
    "switch-exhaustiveness-check",
    `export function omitted(value: 'a'|'b'): number | undefined { switch(value) { case 'a': return 1; } return undefined; }`,
  ],
  [
    "complexity",
    "export function complex(value: number): number { " +
      Array.from(
        { length: 31 },
        (_, n) => `if(value === ${n}) return ${n};`,
      ).join(" ") +
      " return -1; }",
  ],
  [
    "max-depth",
    "export function deep(value: boolean): number { " +
      "if(value) { ".repeat(6) +
      "return 1;" +
      " }".repeat(6) +
      " return 0; }",
  ],
  [
    "max-params",
    "export function parameters(a: number,b: number,c: number,d: number,e: number,f: number): number { return a+b+c+d+e+f; }",
  ],
  [
    "noInlineConfig",
    "// eslint-disable-next-line complexity\nexport const disabled = 1;",
  ],
  ["malformed AST", "export const malformed = ;"],
];
try {
  const positive = run();
  if (positive.status !== 0)
    throw Error("Исходный production gate не проходит:\n" + positive.output);
  console.log(JSON.stringify({ control: "positive", status: "passed" }));
  for (const [rule, source] of cases) {
    put(scope[0] + "__quality_negative.ts", source);
    const result = run();
    clean();
    const expected =
      rule === "malformed AST"
        ? /[Ss]yntax|[Pp]ars|TS1109|[Ee]xpression expected/
        : new RegExp(rule);
    if (result.status === 0 || !expected.test(result.output))
      throw Error("Контроль не обнаружен: " + rule + "\n" + result.output);
    console.log(JSON.stringify({ control: rule, status: "rejected" }));
  }
  put(
    scope[0] + "__quality_cycle_a.ts",
    "import { b } from './__quality_cycle_b.ts'; export function a(): number { return b(); }",
  );
  put(
    scope[0] + "__quality_cycle_b.ts",
    "import { a } from './__quality_cycle_a.ts'; export function b(): number { return a(); }",
  );
  const cycle = run();
  clean();
  if (cycle.status === 0 || !cycle.output.includes("no-production-cycles"))
    throw Error("Cycle не обнаружен:\n" + cycle.output);
  console.log(
    JSON.stringify({ control: "no-production-cycles", status: "rejected" }),
  );
  put(
    scope[0] + "__quality_boundary.ts",
    "import * as internal from 'course-core/domain/vocabulary.ts'; export const boundary = internal;",
  );
  const boundary = run();
  clean();
  if (
    boundary.status === 0 ||
    !boundary.output.includes("providers-use-public-api")
  )
    throw Error("Internal import не обнаружен:\n" + boundary.output);
  console.log(
    JSON.stringify({ control: "providers-use-public-api", status: "rejected" }),
  );

  /** @type {Array<[string, string, string, RegExp]>} */
  const languageCases = [
    [
      "mjs-typed",
      scope[0] + "__quality_negative.mjs",
      "/** @type {string} */\nexport const unsafe = JSON.parse('{}');",
      /no-unsafe-assignment/,
    ],
    [
      "new-helper-type",
      "tools/__quality_negative.mjs",
      "/** @returns {string} */\nexport function wrong() { return 3; }\n",
      /TS2322/,
    ],
    [
      "new-python-bug",
      "tools/__quality_negative.py",
      "def mutable(values: list[str] = []) -> list[str]:\n    return values\n",
      /B006/,
    ],
    [
      "new-python-type",
      "tools/__quality_negative.py",
      "def wrong() -> str:\n    return 3\n",
      /reportReturnType/,
    ],
    [
      "new-lua",
      scope[0] + "__quality_negative.lua",
      "return missing_quality_global\n",
      /W113|undefined-global/,
    ],
    [
      "new-shell",
      "tools/__quality_negative.sh",
      "#!/bin/sh\nprintf '%s\\n' $quality_missing\n",
      /SC2086|SC2154/,
    ],
    ["new-yaml", ".github/__quality_negative.yaml", "enabled: yes\n", /truthy/],
    [
      "new-workflow",
      ".github/workflows/__quality_negative.yml",
      'name: Control\non: push\njobs:\n  probe:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo "${{ nonexistent.value }}"\n',
      /undefined variable \"nonexistent\"/,
    ],
  ];
  for (const [name, path, source, diagnostic] of languageCases) {
    put(path, source);
    const result = run();
    clean();
    if (result.status === 0 || !diagnostic.test(result.output))
      throw Error("Контроль не обнаружен: " + name + "\n" + result.output);
    console.log(JSON.stringify({ control: name, status: "rejected" }));
  }
  put(
    scope[0] + "__quality_negative.ts",
    "export const qualityFormat={value:1}",
    false,
  );
  const unformatted = run();
  clean();
  if (
    unformatted.status === 0 ||
    !/Code style issues|__quality_negative\.ts/.test(unformatted.output)
  )
    throw Error(
      "Новый неформатированный файл не обнаружен:\n" + unformatted.output,
    );
  console.log(
    JSON.stringify({ control: "new-file-format", status: "rejected" }),
  );

  put(scope[0] + "__quality_negative.mjs", "export const qualityConfig = 1;\n");
  const configPath = join(root, "typecheck/javascript.json");
  const originalConfig = readFileSync(configPath, "utf8");
  try {
    const config = JSON.parse(originalConfig);
    config.compilerOptions.checkJs = false;
    writeFileSync(configPath, JSON.stringify(config));
    const result = run();
    if (
      result.status === 0 ||
      !result.output.includes("JavaScript quality gate требует")
    )
      throw Error("Ослабление JS config не обнаружено:\n" + result.output);
    console.log(
      JSON.stringify({ control: "javascript-config", status: "rejected" }),
    );
  } finally {
    writeFileSync(configPath, originalConfig);
    clean();
  }

  const failedTool = mkdtempSync(join(tmpdir(), "exporter-quality-tool-"));
  try {
    const executable = join(failedTool, "prettier");
    writeFileSync(
      executable,
      "#!/bin/sh\nprintf '%s\\n' QUALITY_EXPECTED_TOOL_FAILURE >&2\nexit 73\n",
    );
    chmodSync(executable, 0o755);
    const result = run({ PATH: failedTool + ":" + process.env.PATH });
    if (
      result.status === 0 ||
      !result.output.includes("QUALITY_EXPECTED_TOOL_FAILURE")
    )
      throw Error("Отказ анализатора не блокирует gate:\n" + result.output);
    console.log(
      JSON.stringify({ control: "tool-failure", status: "rejected" }),
    );
  } finally {
    rmSync(failedTool, { recursive: true, force: true });
  }
} finally {
  clean();
}
