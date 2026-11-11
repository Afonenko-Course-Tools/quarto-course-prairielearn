import { publishDirectory } from "../_extensions/course-prairielearn/application/publication.ts";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw Error(message);
}

Deno.test("directory publication refuses missing GNU capability before touching source", async () => {
  const root = await Deno.makeTempDir({ prefix: "pl-publish-capability-" });
  try {
    const source = root + "/source", destination = root + "/output", bin = root + "/bin";
    await Deno.mkdir(source);
    await Deno.mkdir(bin);
    // External synthetic executable models a host with an incompatible mv.
    await Deno.writeTextFile(bin + "/mv", "#!/bin/sh\nprintf 'mv without required options\\n'\n");
    await Deno.chmod(bin + "/mv", 0o700);
    let error: unknown;
    try { await publishDirectory(source, destination, { PATH: bin }); } catch (caught) { error = caught; }
    assert(String(error).includes("requires GNU mv"), "Missing capability accepted: " + error);
    assert((await Deno.lstat(source)).isDirectory, "Source consumed on capability refusal");
    assert(!await Deno.lstat(destination).then(() => true, () => false), "Destination created on capability refusal");
  } finally { await Deno.remove(root, { recursive: true }); }
});

Deno.test({
  name: "directory publication refuses EXDEV without copying payload",
  ignore: !Deno.env.get("PL_EXDEV_TEST_DIR"),
  async fn() {
    const directory = Deno.env.get("PL_EXDEV_TEST_DIR");
    if (!directory) throw Error("PL_EXDEV_TEST_DIR требуется для реальной EXDEV проверки");
    const source = await Deno.makeTempDir({ prefix: "pl-publish-exdev-" });
    const targetRoot = await Deno.makeTempDir({ dir: directory, prefix: "pl-publish-exdev-" });
    try {
      assert((await Deno.stat(source)).dev !== (await Deno.stat(targetRoot)).dev, "EXDEV fixture must use different filesystems");
      await Deno.writeTextFile(source + "/keep", "PAYLOAD");
      let error: unknown;
      try { await publishDirectory(source, targetRoot + "/out"); } catch (caught) { error = caught; }
      assert(String(error).includes("cannot publish fresh output"), "EXDEV unexpectedly succeeded: " + error);
      assert(await Deno.readTextFile(source + "/keep") === "PAYLOAD", "EXDEV consumed source");
      assert(!await Deno.lstat(targetRoot + "/out").then(() => true, () => false), "EXDEV copied payload");
    } finally {
      await Deno.remove(source, { recursive: true });
      await Deno.remove(targetRoot, { recursive: true });
    }
  },
});
