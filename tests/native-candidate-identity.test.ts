import * as Core from "course-core/public.ts";
import { join } from "node:path";
import { readNativeAdapterExpectation } from "../_extensions/course-prairielearn/application/native-adapter.ts";

Deno.test(
  "Native candidate сохраняет closed identity refusal публичного Core",
  async () => {
    const temporary = await Deno.makeTempDir();
    try {
      const root = await Deno.realPath(temporary);
      const operation = "11111111-1111-4111-8111-111111111111";
      const directory = join(
        root,
        "_generated/course-spec/prairielearn-native",
      );
      await Deno.mkdir(join(directory, operation), { recursive: true });
      await Deno.writeTextFile(
        join(directory, "active.json"),
        JSON.stringify({ operation }),
      );
      const identity = {
        operation,
        profiles: ["full"],
        projection: "author",
        runtime: "quarto-1.11.5",
      };
      const request = {
        schema: "pl-native-business-request-v1",
        owner: root,
        identity,
        outputDirectory: join(root, "_site"),
        inputs: [
          {
            source: "index.qmd",
            captureWitness: "22222222-2222-4222-8222-222222222222",
          },
        ],
      };
      const path = join(directory, operation, "request.json");
      await Deno.writeTextFile(path, JSON.stringify(request));
      const valid = await readNativeAdapterExpectation(Core, root);
      if (valid.identity.operation !== operation)
        throw Error("Корректная canonical identity не принята");
      await Deno.writeTextFile(
        path,
        JSON.stringify({ ...request, identity: { ...identity, extra: true } }),
      );
      let refused = false;
      try {
        await readNativeAdapterExpectation(Core, root);
      } catch {
        refused = true;
      }
      if (!refused)
        throw Error("Unknown identity key скрыт перед strict Core decoder");
    } finally {
      await Deno.remove(temporary, { recursive: true });
    }
  },
);
