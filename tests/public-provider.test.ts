import { installedCore } from "../_extensions/course-prairielearn/application/public-provider.ts";
import { join } from "node:path";
Deno.test("installed provider rejects callable but incomplete public Core before capture", async () => {
  const root = await Deno.makeTempDir({ prefix: "pl-provider-" });
  try {
    const path = join(root, "public.ts");
    await Deno.writeTextFile(
      path,
      "export function withNativeCaptureScope() { throw Error('must not run'); }\n",
    );
    let message = "";
    try {
      await installedCore(path);
    } catch (error) {
      message = String(error);
    }
    if (
      !message.includes(
        "PL.PUBLIC_API_REQUIRED: installed Core public functions/schemas",
      )
    ) {
      throw Error(
        "Incomplete installed provider did not fail at its public boundary: " +
          message,
      );
    }
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
