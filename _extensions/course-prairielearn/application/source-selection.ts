import { join, relative, resolve } from "node:path";
export const safePath = (p: string) =>
  typeof p === "string" && !!p && !/^(?:[\/\\]|[A-Za-z]:)/.test(p) &&
  !p.includes("\\") && !p.includes("\0") && !p.split("/").some((p) =>
    !p || p === "." || p === ".."
  );
export async function hash(data: Uint8Array | string) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        typeof data === "string"
          ? new TextEncoder().encode(data)
          : new Uint8Array(data),
      ),
    ),
  ].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function compareKeys(a: string, b: string): number {
  const left = Array.from(a), right = Array.from(b);
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    const d = left[i].codePointAt(0)! - right[i].codePointAt(0)!;
    if (d) return d;
  }
  return left.length - right.length;
}
export function canonical(v: any): string {
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  if (v && typeof v === "object") {
    return "{" + Object.entries(v).filter(([, v]) =>
      v !== undefined
    ).sort(([a], [b]) => compareKeys(a, b)).map(([k, v]) =>
      JSON.stringify(k) + ":" + canonical(v)
    ).join(",") + "}";
  }
  return JSON.stringify(v);
}
export async function readSelected(root: string, s: any) {
  if (
    !safePath(s.projectRelativePath) || !safePath(s.submissionRelativePath) ||
    !/^[a-f0-9]{64}$/.test(s.sha256)
  ) throw new Error("PL source selection invalid");
  let path = root;
  for (const part of s.projectRelativePath.split("/")) {
    path = join(path, part);
    if ((await Deno.lstat(path)).isSymlink) {
      throw new Error("PL symlink forbidden");
    }
  }
  if (relative(resolve(root), resolve(path)).startsWith("..")) {
    throw new Error("PL source outside project");
  }
  const data = await Deno.readFile(path);
  if (await hash(data) !== s.sha256) {
    throw new Error("PL source snapshot changed");
  }
  return data;
}
export async function selectedSources(root: string, p: any) {
  if (!p.check || !p.sources?.length) {
    throw new Error("PL selected question requires project-check and sources");
  }
  const profile = p.check.sourceProfile;
  if (
    !profile || !safePath(profile.root) ||
    (profile.root !== "student" && !profile.root.startsWith("student/")) ||
    !["implementation", "student-tests"].includes(profile.mode)
  ) {
    throw new Error(
      "PL source profile must select the student answer partition",
    );
  }
  const names = new Set();
  const files = [];
  for (const s of p.sources) {
    if (
      !s.submissionRelativePath.endsWith(".java") ||
      names.has(s.submissionRelativePath)
    ) throw new Error("PL student build script or duplicate source denied");
    if (
      profile.mode === "implementation" &&
      (s.projectRelativePath === "student/src/test" ||
        s.projectRelativePath.startsWith("student/src/test/"))
    ) throw new Error("PL implementation cannot submit public student tests");
    const expected = p.check.sourceProfile.root + "/" +
      s.submissionRelativePath;
    if (s.projectRelativePath !== expected) {
      throw new Error("PL source profile mapping invalid");
    }
    names.add(s.submissionRelativePath);
    const data = await readSelected(root, s);
    if (data.length > 1024 * 1024) {
      throw new Error("PL oversized editor source");
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(data);
    if (text.includes("\0")) throw new Error("PL NUL editor source");
    files.push({ name: s.submissionRelativePath, data });
  }
  return files;
}
