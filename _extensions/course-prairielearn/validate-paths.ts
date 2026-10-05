import { isAbsolute, join, relative } from "stdlib/path";
const [project, ...directories] = Deno.args;
const root = await Deno.realPath(project);
for (const directory of directories) {
  if (!directory.startsWith("/") || directory.startsWith("//")) {
    throw new Error(`Путь относительно корня курса: ${directory}`);
  }
  const real = await Deno.realPath(join(root, directory.slice(1)));
  const path = relative(root, real);
  if (
    !path || path === ".." || path.startsWith("../") ||
    path.startsWith("..\\") || isAbsolute(path)
  ) throw new Error(`Путь выходит за пределы курса: ${directory}`);
  if (!(await Deno.stat(real)).isDirectory) {
    throw new Error(`Отсутствует каталог проекта: ${directory}`);
  }
}
