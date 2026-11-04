import { withNativeStagedOutput } from "../_extensions/course-prairielearn/application/native-course.ts";
const assert = (value: unknown, message: string) => {
  if (!value) throw Error(message);
};
Deno.test("closing rejection после stage discards и не publish", async () => {
  const events: string[] = [];
  const sentinel = Error("CLOSING_FENCE_SENTINEL");
  let error: any;
  try {
    await withNativeStagedOutput(async (save) => {
      save({
        discard: async () => {
          events.push("discard");
        },
      });
      throw sentinel;
    });
  } catch (e) {
    error = e;
  }
  assert(
    error === sentinel && events.join(",") === "discard",
    "Staged error потерян или output опубликован",
  );
});
