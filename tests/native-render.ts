// A native process exit is the authority for consuming this run's results.
import { join } from "stdlib/path";
export async function renderNative(
  source: string,
  profile: "student" | "full",
  input = ".",
) {
  const result = await new Deno.Command(Deno.env.get("QUARTO") || "quarto", {
    args: [
      "render",
      input,
      "--profile",
      profile,
      "--to",
      "html",
      "--fail-if-warnings",
    ],
    cwd: source,
    stdout: "piped",
    stderr: "piped",
  }).output();
  let text = new TextDecoder().decode(result.stdout) +
    new TextDecoder().decode(result.stderr);
  let ok = result.success;
  if (ok && input === ".") {
    const validated = await new Deno.Command(
      Deno.env.get("QUARTO") || "quarto",
      {
        args: [
          "run",
          "_extensions/course-core/entrypoints/check.ts",
          ".",
          profile,
        ],
        cwd: source,
        stdout: "piped",
        stderr: "piped",
      },
    ).output();
    text += new TextDecoder().decode(validated.stdout) +
      new TextDecoder().decode(validated.stderr);
    ok = validated.success;
  }
  if (ok) {
    const pointer = JSON.parse(
      await Deno.readTextFile(
        join(source, "_generated/course-spec/active-native-run.json"),
      ),
    );
    const run = JSON.parse(
      await Deno.readTextFile(
        join(source, "_generated/course-spec/native-run.json"),
      ),
    );
    if (
      run.schema !== "course-native-run-v1" || !run.profiles.includes(profile)
    ) throw new Error("Native run context missing");
    for (const entry of run.documents) {
      if (
        entry.course.view !== profile ||
        !entry.document.profiles.includes(profile)
      ) throw new Error("Mixed audience native document");
    }
    for await (
      const entry of Deno.readDir(join(pointer.directory, "adapters"))
    ) {
      if (!entry.isDirectory) continue;
      for await (
        const file of Deno.readDir(
          join(pointer.directory, "adapters", entry.name),
        )
      ) {
        if (
          !file.name.endsWith(".json") || file.name === "contract.json"
        ) continue;
        const fragment = JSON.parse(
          await Deno.readTextFile(
            join(pointer.directory, "adapters", entry.name, file.name),
          ),
        );
        const document = run.documents.find((value: { source: string }) =>
          value.source === fragment.source
        );
        if (
          !document || fragment.course.view !== profile ||
          JSON.stringify(Object.entries(fragment.document).sort()) !==
            JSON.stringify(Object.entries(document.document).sort())
        ) {
          throw new Error(
            "Adapter context disagrees with current DocumentResult",
          );
        }
      }
    }
  }
  const evidence = Deno.env.get("ADAPTER_EVIDENCE");
  if (evidence) {
    await Deno.mkdir(evidence, { recursive: true });
    await Deno.writeTextFile(
      join(evidence, `native-${crypto.randomUUID()}.json`),
      JSON.stringify({ profile, input, exit: result.code, text }, null, 2),
    );
  }
  return { ok, text, stage: source };
}

export async function selectedDocument(
  source: string,
  input: string,
  profile: "student" | "full",
) {
  const result = await renderNative(source, profile, input);
  if (!result.ok) throw new Error(result.text);
  const run = JSON.parse(
    await Deno.readTextFile(
      join(source, "_generated/course-spec/native-run.json"),
    ),
  );
  if (run.documents.length !== 1 || run.documents[0].source !== input) {
    throw new Error("Selected native command consumed retained documents");
  }
  const invalid = await new Deno.Command(Deno.env.get("QUARTO") || "quarto", {
    args: ["run", "_extensions/course-core/entrypoints/check.ts", ".", profile],
    cwd: source,
    stdout: "piped",
    stderr: "piped",
  }).output();
  const text = new TextDecoder().decode(invalid.stdout) +
    new TextDecoder().decode(invalid.stderr);
  if (
    invalid.success ||
    !text.includes("CORE.UNKNOWN_MEMBER") &&
      !text.includes("RELEASE.FULL_NATIVE_RUN_REQUIRED")
  ) {
    throw new Error(
      "Incomplete current inventory passed full validation: " + text,
    );
  }
}

export async function verifyInstalled(
  project: string,
  repository: string,
  name: string,
) {
  const payload = join(repository, "_extensions", "course-" + name);
  const installed = join(project, "_extensions", "course-" + name);
  async function files(root: string, prefix = ""): Promise<string[]> {
    const result: string[] = [];
    for await (const entry of Deno.readDir(join(root, prefix))) {
      if (entry.isSymlink) {
        throw new Error("Installed adapter contains symlink: " + entry.name);
      }
      const path = join(prefix, entry.name);
      if (entry.isDirectory) result.push(...await files(root, path));
      else if (entry.isFile) result.push(path);
    }
    return result.sort();
  }
  const expected = await files(payload), actual = await files(installed);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error("Installed adapter payload file set differs");
  }
  for (const file of expected) {
    const left = await Deno.readFile(join(payload, file)),
      right = await Deno.readFile(join(installed, file));
    if (
      left.length !== right.length ||
      left.some((byte, index) => byte !== right[index])
    ) throw new Error("Installed adapter byte mismatch: " + file);
  }
}
