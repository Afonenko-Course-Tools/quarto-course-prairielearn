import { isAbsolute, join, relative } from "stdlib/path";
import { diagnostic } from "./application/diagnostics.ts";
async function main() {
  const [project, source, ...directories] = Deno.args;
  const root = await Deno.realPath(project);
  for (let i = 0; i < directories.length; i += 2) {
    const directory = directories[i], id = directories[i + 1];
    const context = {
      source,
      id,
      field: "project",
      hint: "Укажите существующий каталог проекта внутри выбранного проекта",
    };
    const fail = (message: string, cause?: unknown): never => {
      throw diagnostic("PL.PROJECT_INVALID", message, context, cause);
    };
    if (!directory.startsWith("/") || directory.startsWith("//")) {
      fail(`Путь должен идти от корня выбранного проекта: ${directory}`);
    }
    let real: string;
    try {
      real = await Deno.realPath(join(root, directory.slice(1)));
    } catch (cause) {
      if (!(cause instanceof Deno.errors.NotFound)) throw cause;
      fail(`Отсутствует каталог проекта: ${directory}`, cause);
    }
    const path = relative(root, real!);
    if (
      !path || path === ".." || path.startsWith("../") ||
      path.startsWith("..\\") || isAbsolute(path)
    ) {
      fail(`Путь выходит за пределы выбранного проекта: ${directory}`);
    }
    if (!(await Deno.stat(real!)).isDirectory) {
      fail(`Путь проекта не является каталогом: ${directory}`);
    }
  }
}
try {
  await main();
} catch (error) {
  if (!(error instanceof Error) || error.name !== "ExtensionDiagnostic") {
    throw error;
  }
  console.error(error.message);
  Deno.exit(1);
}
