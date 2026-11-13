/** Наличие значения проверяется в месте чтения fixture, без утверждения типа. */
export function required<T>(value: T | undefined, label = "fixture value"): T {
  if (value === undefined) throw Error("Отсутствует " + label);
  return value;
}

/** Недоверенные отрицательные данные остаются объектами до штатного decoder. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw Error("Ожидался объект fixture");
  return value;
}
export function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw Error("Ожидался массив fixture");
  return value;
}

export function property(value: unknown, key: PropertyKey): unknown {
  return value !== null &&
    (typeof value === "object" || typeof value === "function")
    ? Reflect.get(value, key)
    : undefined;
}
export function fixtureAt(
  value: unknown,
  path: readonly (string | number)[],
): unknown {
  for (const key of path) {
    if (value === null || typeof value !== "object")
      throw Error("Неверный путь fixture");
    value = Reflect.get(value, key);
  }
  return value;
}
export function setFixture(
  value: unknown,
  path: readonly (string | number)[],
  replacement: unknown,
): void {
  const key = required(path.at(-1), "fixture path");
  const parent = fixtureAt(value, path.slice(0, -1));
  if (parent === null || typeof parent !== "object")
    throw Error("Неверный parent fixture");
  if (!Reflect.set(parent, key, replacement))
    throw Error("Не удалось изменить fixture");
}
export function deleteFixture(
  value: unknown,
  path: readonly (string | number)[],
): void {
  const key = required(path.at(-1), "fixture path");
  const parent = fixtureAt(value, path.slice(0, -1));
  if (parent === null || typeof parent !== "object")
    throw Error("Неверный parent fixture");
  if (!Reflect.deleteProperty(parent, key))
    throw Error("Не удалось удалить поле fixture");
}
export function string(value: unknown): string {
  if (typeof value !== "string") throw Error("Ожидалась строка fixture");
  return value;
}
export function publicNodes(
  value: unknown,
): import("course-core/public.ts").PublicBodyPackage["questions"][number]["condition"] {
  return array(value).map((value) => {
    const node = record(value);
    return { ...node, t: string(node.t) };
  });
}
export function pandoc(value: unknown) {
  const input = record(value);
  const version = array(input["pandoc-api-version"]).map((value) => {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0)
      throw Error("Некорректная версия Pandoc fixture");
    return value;
  });
  return { "pandoc-api-version": version, blocks: publicNodes(input.blocks) };
}
