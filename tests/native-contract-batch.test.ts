import { required } from "./fixture-values.ts";
import * as Core from "course-core/public.ts";
import { strict as assert } from "node:assert";
import { join } from "node:path";
Deno.test("настоящий batch каталогов сохраняет порядок и student/full планы", async () => {
  const root = await Deno.makeTempDir({ prefix: "pl-directory-batch-" });
  try {
    await Deno.writeTextFile(
      join(root, "_quarto.yml"),
      "project: {type: website}\nformat: html\n",
    );
    for (const name of ["a", "b"]) {
      await Deno.mkdir(join(root, "projects", name, "starter"), {
        recursive: true,
      });
      await Deno.writeTextFile(
        join(root, "projects", name, "_metadata.yml"),
        "course-project:\n  starter: {path: starter}\n",
      );
      await Deno.writeTextFile(
        join(root, "projects", name, "starter", "Study.java"),
        "class Study {}\n",
      );
    }
    await Core.readProjectContexts([{
      owner: root,
      directories: ["projects/a", "projects/b"],
      profiles: [],
      format: "html",
    }], async ([batch]) => {
      assert.equal(required(batch).contexts.length, 2);
      for (const [index, context] of required(batch).contexts.entries()) {
        assert.equal(
          context.input,
          join(root, "projects", index === 0 ? "a" : "b"),
        );
        const student = await Core.planProject(context, {
            audience: "student",
          }),
          full = await Core.planProject(context, { audience: "full" });
        assert.equal(student.input, context.input);
        assert.equal(full.input, context.input);
        assert.equal(student.audience, "student");
        assert.equal(full.audience, "full");
      }
      assert(required(batch).metrics.yamlFileReads >= 3);
      assert(required(batch).metrics.directoryLayers >= 2);
    });
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
