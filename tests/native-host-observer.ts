/** Test-only host IO: child internals остаются отдельными Core counters. */
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
  const commands: any[] = [], tempWrites: any[] = [];
  (Deno as any).readFile = async (...a: any[]) => {
    counts.readFile++;
    const bytes = await (actual.readFile as any)(...a);
    counts.readFileBytes += bytes.byteLength;
    return bytes;
  };
  (Deno as any).readTextFile = async (...a: any[]) => {
    counts.readTextFile++;
    const text = await (actual.readTextFile as any)(...a);
    counts.readTextBytes += new TextEncoder().encode(text).length;
    return text;
  };
  for (const key of ["lstat", "realPath", "readDir"] as const) {
    (Deno as any)[key] = (...a: any[]) => {
      counts[key]++;
      return (actual[key] as any)(...a);
    };
  }
  (crypto.subtle as any).digest = (...a: any[]) => {
    counts.digests++;
    counts.digestBytes += a[1].byteLength;
    return (actual.digest as any)(...a);
  };
  (Deno as any).writeFile = async (...a: any[]) => {
    counts.writeFile++;
    counts.writeFileBytes += a[1].byteLength;
    if (String(a[0]).includes("/course-bound-context-")) {
      tempWrites.push({
        path: String(a[0]),
        bytes: a[1].byteLength,
        kind: "raw",
      });
    }
    return (actual.writeFile as any)(...a);
  };
  (Deno as any).writeTextFile = async (...a: any[]) => {
    const bytes = new TextEncoder().encode(a[1]).length;
    counts.writeTextFile++;
    counts.writeTextBytes += bytes;
    if (String(a[0]).includes("/course-bound-context-")) {
      tempWrites.push({
        path: String(a[0]),
        bytes,
        kind: "generated-or-instrumented",
      });
    }
    return (actual.writeTextFile as any)(...a);
  };
  (Deno as any).Command = new Proxy(actual.Command, {
    construct(target, args: any[]) {
      commands.push({
        command: String(args[0]),
        args: args[1]?.args ?? [],
        cwd: args[1]?.cwd,
      });
      return Reflect.construct(target, args);
    },
  });
  const started = performance.now();
  return {
    snapshot: () => ({
      counts: { ...counts },
      commands: structuredClone(commands),
      tempWrites: structuredClone(tempWrites),
      elapsedSeconds: (performance.now() - started) / 1000,
    }),
    restore() {
      for (const [key, value] of Object.entries(actual)) {
        if (key !== "digest") (Deno as any)[key] = value;
      }
      (crypto.subtle as any).digest = actual.digest;
    },
  };
}
export function hostDelta(before: any, after: any) {
  return {
    counts: Object.fromEntries(
      Object.keys(after.counts).map(
        (k) => [k, after.counts[k] - before.counts[k]],
      ),
    ),
    commands: after.commands.slice(before.commands.length),
    tempWrites: after.tempWrites.slice(before.tempWrites.length),
    elapsedSeconds: after.elapsedSeconds - before.elapsedSeconds,
  };
}
