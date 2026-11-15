import { createMetrics } from "../observability/bridge.ts";
createMetrics("course-prairielearn");
export const safePath = (p: unknown): p is string =>
  typeof p === "string" &&
  !!p &&
  !/^(?:[\/\\]|[A-Za-z]:)/.test(p) &&
  !p.includes("\\") &&
  !p.includes("\0") &&
  !p.split("/").some((p) => !p || p === "." || p === "..");
function compareKeys(a: string, b: string): number {
  const left = Array.from(a),
    right = Array.from(b);
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    const leftPoint = left[i]?.codePointAt(0),
      rightPoint = right[i]?.codePointAt(0);
    if (leftPoint === undefined || rightPoint === undefined) {
      throw new TypeError("canonical: отсутствует символ сравниваемого ключа");
    }
    const d = leftPoint - rightPoint;
    if (d) return d;
  }
  return left.length - right.length;
}
export function canonical(v: unknown): string {
  const value = canonicalValue(v);
  if (value === undefined) {
    throw new TypeError("canonical: значение root не имеет JSON-представления");
  }
  return value;
}
function canonicalValue(v: unknown): string | undefined {
  if (Array.isArray(v)) return "[" + v.map(canonicalValue).join(",") + "]";
  if (v && typeof v === "object") {
    const entries: [string, unknown][] = Object.entries(v);
    return (
      "{" +
      entries
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => compareKeys(a, b))
        .map(([k, v]) => JSON.stringify(k) + ":" + canonicalValue(v))
        .join(",") +
      "}"
    );
  }
  return JSON.stringify(v);
}
