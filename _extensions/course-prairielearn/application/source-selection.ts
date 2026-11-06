import {createMetrics as __createMetrics} from "../observability/bridge.ts";
const __metrics=__createMetrics("course-prairielearn");
import { javaBuild } from './java-build.ts';
import { join, relative, resolve } from "node:path";
export const safePath = (p: unknown): p is string =>
  typeof p === "string" && !!p && !/^(?:[\/\\]|[A-Za-z]:)/.test(p) &&
  !p.includes("\\") && !p.includes("\0") && !p.split("/").some((p) =>
    !p || p === "." || p === ".."
  );
function compareKeys(a: string, b: string): number {
  const left = Array.from(a), right = Array.from(b);
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    const d = left[i].codePointAt(0)! - right[i].codePointAt(0)!;
    if (d) return d;
  }
  return left.length - right.length;
}
export function canonical(v: any): string {
  return canonicalValue(v);
}
function canonicalValue(v: any): string {
  if (Array.isArray(v)) return "[" + v.map(canonicalValue).join(",") + "]";
  if (v && typeof v === "object") {
    return "{" + Object.entries(v).filter(([, v]) =>
      v !== undefined
    ).sort(([a], [b]) => compareKeys(a, b)).map(([k, v]) =>
      JSON.stringify(k) + ":" + canonicalValue(v)
    ).join(",") + "}";
  }
  return JSON.stringify(v);
}
