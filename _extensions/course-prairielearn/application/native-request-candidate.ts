import type { NativeOperationIdentity } from "course-core/public.ts";
import { join, resolve } from "node:path";
// Inert C entry: только builtin IO собственного correlation transport.
// До публичного Core gate не импортировать exporter/metrics/runtime modules.
const safe = (v: unknown): v is string =>
  typeof v === "string" && !!v && !v.includes("\\") && !v.includes("\0") &&
  !v.startsWith("/") &&
  !v.split("/").some((p) => !p || p === "." || p === "..");
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const strings = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.every((item: unknown) => typeof item === "string");
const uuid = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
    .test(v);
async function ownFile(root: string, path: string) {
  if (!safe(path)) throw Error("PL.CAPTURE_CHANGED: candidate path");
  let current = root;
  for (const [i, part] of path.split("/").entries()) {
    current = join(current, part);
    const s = await Deno.lstat(current);
    if (
      s.isSymlink || s.isFile && s.size > 4 * 1024 * 1024 ||
      !(i === path.split("/").length - 1 ? s.isFile : s.isDirectory)
    ) throw Error("PL.CAPTURE_CHANGED: candidate alias/type");
  }
  return current;
}
/** Не Core authority: request должен быть повторно принят публичным gate. */
export async function readNativeEntryCandidate(owner: string) {
  const root = await Deno.realPath(owner),
    base = "_generated/course-spec/prairielearn-native";
  try {
    const active: unknown = JSON.parse(
      await Deno.readTextFile(await ownFile(root, base + "/active.json")),
    );
    if (!record(active) || !uuid(active.operation)) {
      throw Error("PL.CAPTURE_CHANGED: candidate generation");
    }
    const request: unknown = JSON.parse(
      await Deno.readTextFile(
        await ownFile(root, base + "/" + active.operation + "/request.json"),
      ),
    );
    if (!record(request) || !record(request.identity)) {
      throw Error("PL.CAPTURE_CHANGED: candidate binding");
    }
    const id = request.identity;
    const inputs: { source: string; captureWitness: string }[] = [];
    if (!Array.isArray(request.inputs)) {
      throw Error("PL.CAPTURE_CHANGED: candidate binding");
    }
    for (const item of request.inputs) {
      if (!record(item) || !safe(item.source) || !uuid(item.captureWitness)) {
        throw Error("PL.CAPTURE_CHANGED: candidate binding");
      }
      inputs.push({ source: item.source, captureWitness: item.captureWitness });
    }
    if (
      request.schema !== "pl-native-business-request-v1" ||
      request.owner !== root ||
      Object.keys(id).some((key) =>
        !["operation", "runtime", "projection", "profiles"].includes(key)
      ) ||
      id.operation !== active.operation || !uuid(id.operation) ||
      id.runtime !== "quarto-1.11.5" ||
      (id.projection !== "student" && id.projection !== "author") ||
      !strings(id.profiles) || id.profiles.length > 16 ||
      id.profiles.some((p) => !/^[-a-z0-9]+$/.test(p)) ||
      typeof request.outputDirectory !== "string" ||
      request.outputDirectory !== resolve(request.outputDirectory) ||
      !request.outputDirectory.startsWith(root + "/") || !inputs.length ||
      inputs.length > 4096 ||
      new Set(inputs.map((i) => i.source)).size !== inputs.length
    ) throw Error("PL.CAPTURE_CHANGED: candidate binding");
    const identity: NativeOperationIdentity = {
      operation: id.operation,
      runtime: id.runtime,
      projection: id.projection,
      profiles: [...id.profiles],
    };
    return {
      root,
      identity,
      inputs,
      outputDirectory: request.outputDirectory,
      expectedSources: inputs.map((i) => i.source),
    };
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      throw Error("PL.CAPTURE_MISSING: native preparation required", {
        cause: error,
      });
    }
    throw error;
  }
}
