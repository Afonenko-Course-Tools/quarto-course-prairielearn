/** Test-only host IO; child internals остаются отдельными Core counters. */
import { required } from "./fixture-values.ts";

export function observeNativeHost() {
  const actual = {
    readFile: Deno.readFile,
    readTextFile: Deno.readTextFile,
    lstat: Deno.lstat,
    realPath: Deno.realPath,
    readDir: Deno.readDir,
    writeFile: Deno.writeFile,
    writeTextFile: Deno.writeTextFile,
    Command: Deno.Command,
    digest: crypto.subtle.digest.bind(crypto.subtle),
  };
  const counts = {
    readFile: 0,
    readFileBytes: 0,
    readTextFile: 0,
    readTextBytes: 0,
    lstat: 0,
    realPath: 0,
    readDir: 0,
    digests: 0,
    digestBytes: 0,
    writeFile: 0,
    writeFileBytes: 0,
    writeTextFile: 0,
    writeTextBytes: 0,
  };
  const commands: { command: string; args: string[]; cwd?: string | URL }[] =
    [];
  const tempWrites: { path: string; bytes: number; kind: string }[] = [];
  Deno.readFile = async (...args) => {
    counts.readFile++;
    const bytes = await actual.readFile(...args);
    counts.readFileBytes += bytes.byteLength;
    return bytes;
  };
  Deno.readTextFile = async (...args) => {
    counts.readTextFile++;
    const text = await actual.readTextFile(...args);
    counts.readTextBytes += new TextEncoder().encode(text).length;
    return text;
  };
  Deno.lstat = (...args) => {
    counts.lstat++;
    return actual.lstat(...args);
  };
  Deno.realPath = (...args) => {
    counts.realPath++;
    return actual.realPath(...args);
  };
  Deno.readDir = (...args) => {
    counts.readDir++;
    return actual.readDir(...args);
  };
  crypto.subtle.digest = (...args) => {
    counts.digests++;
    counts.digestBytes += args[1].byteLength;
    return actual.digest(...args);
  };
  Deno.writeFile = async (path, data, options) => {
    counts.writeFile++;
    let bytes = 0;
    const count = (chunk: Uint8Array) => {
      bytes += chunk.byteLength;
      counts.writeFileBytes += chunk.byteLength;
    };
    if (data instanceof Uint8Array) count(data);
    const input =
      data instanceof Uint8Array
        ? data
        : data.pipeThrough(
            new TransformStream<Uint8Array, Uint8Array>({
              transform(chunk, controller) {
                count(chunk);
                controller.enqueue(chunk);
              },
            }),
          );
    const result = await actual.writeFile(path, input, options);
    if (String(path).includes("/course-bound-context-"))
      tempWrites.push({ path: String(path), bytes, kind: "raw" });
    return result;
  };
  Deno.writeTextFile = async (path, data, options) => {
    counts.writeTextFile++;
    let bytes = 0;
    const count = (chunk: string) => {
      const size = new TextEncoder().encode(chunk).length;
      bytes += size;
      counts.writeTextBytes += size;
    };
    if (typeof data === "string") count(data);
    const input =
      typeof data === "string"
        ? data
        : data.pipeThrough(
            new TransformStream<string, string>({
              transform(chunk, controller) {
                count(chunk);
                controller.enqueue(chunk);
              },
            }),
          );
    const result = await actual.writeTextFile(path, input, options);
    if (String(path).includes("/course-bound-context-"))
      tempWrites.push({
        path: String(path),
        bytes,
        kind: "generated-or-instrumented",
      });
    return result;
  };
  Deno.Command = class extends actual.Command {
    constructor(command: string | URL, options?: Deno.CommandOptions) {
      commands.push({
        command: String(command),
        args: [...(options?.args ?? [])],
        ...(options?.cwd === undefined ? {} : { cwd: options.cwd }),
      });
      super(command, options);
    }
  };
  const started = performance.now();
  return {
    snapshot: () => ({
      counts: { ...counts },
      commands: structuredClone(commands),
      tempWrites: structuredClone(tempWrites),
      elapsedSeconds: (performance.now() - started) / 1000,
    }),
    restore() {
      Object.assign(Deno, {
        readFile: actual.readFile,
        readTextFile: actual.readTextFile,
        lstat: actual.lstat,
        realPath: actual.realPath,
        readDir: actual.readDir,
        writeFile: actual.writeFile,
        writeTextFile: actual.writeTextFile,
        Command: actual.Command,
      });
      crypto.subtle.digest = actual.digest;
    },
  };
}
export function hostDelta(
  before: ReturnType<ReturnType<typeof observeNativeHost>["snapshot"]>,
  after: typeof before,
) {
  const prior: Record<string, number> = before.counts;
  return {
    counts: Object.fromEntries(
      Object.entries(after.counts).map(([key, value]) => [
        key,
        value - required(prior[key], "host counter " + key),
      ]),
    ),
    commands: after.commands.slice(before.commands.length),
    tempWrites: after.tempWrites.slice(before.tempWrites.length),
    elapsedSeconds: after.elapsedSeconds - before.elapsedSeconds,
  };
}
