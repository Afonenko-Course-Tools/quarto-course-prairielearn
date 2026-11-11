import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { diagnostic, type DiagnosticContext } from "./diagnostics.ts";
export const fail = (
  message: string,
  context?: DiagnosticContext,
  cause?: unknown,
): never => {
  throw diagnostic("ADAPTER", message, context, cause);
};
export const record = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
export const safe = (v: unknown): v is string =>
  typeof v === "string" && !!v && !v.includes("\\") && !v.includes("\0") &&
  !isAbsolute(v) && !v.split("/").some((p) => !p || p === "." || p === "..");
export const fields = (
  v: unknown,
  required: string[],
  optional: string[] = [],
): v is Record<string, unknown> =>
  record(v) && required.every((k) => Object.hasOwn(v, k)) &&
  Object.keys(v).every((k) => [...required, ...optional].includes(k));
export async function publicProjectFiles(root: string) {
  const result = await files(root, { field: "project.student" }, true);
  for (const file of result) {
    if (
      file.name.split("/").some((part) =>
        [
          "private",
          "reference",
          "solution",
          "solutions",
          "grading-notes",
          "rubric.md",
          "contract.md",
        ].includes(part)
      ) || /\.(?:qmd|rmd|ipynb|class|jar)$/i.test(file.name)
    ) {
      fail("Закрытый или служебный файл в student partition", {
        field: "project.student",
        source: file.name,
      });
    }
  }
  return result;
}
export async function files(
  root: string,
  context: DiagnosticContext,
  allowStudentGitignore = false,
): Promise<{ name: string; data: Uint8Array }[]> {
  const collected: { name: string; data: Uint8Array }[] = [];
  async function walk(directory: string) {
    if ((await Deno.lstat(directory)).isSymlink) {
      fail("Символьная ссылка в файлах проекта", context);
    }
    for await (const entry of Deno.readDir(directory)) {
      const path = join(directory, entry.name);
      if (entry.isSymlink) fail("Символьная ссылка в файлах проекта", context);
      if (
        (entry.name.startsWith(".") &&
          !(allowStudentGitignore && directory === root &&
            entry.name === ".gitignore" && entry.isFile)) ||
        ["build", "node_modules", "_generated", "_extensions"].includes(
          entry.name,
        )
      ) continue;
      if (entry.isDirectory) await walk(path);
      else if (entry.isFile) {
        collected.push({
          name: relative(root, path).replaceAll("\\", "/"),
          data: await Deno.readFile(path),
        });
      } else fail("В проекте присутствует файл особого типа", context);
    }
  }
  await walk(root);
  return collected.sort((a, b) => a.name.localeCompare(b.name));
}
