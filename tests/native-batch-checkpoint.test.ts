const moduleURL = Deno.env.get("C_TEST_NATIVE_COURSE") ??
  new URL(
    "../_extensions/course-prairielearn/application/native-course.ts",
    import.meta.url,
  ).href;
const { withNativeProjectPlans, withNativeStagedOutput } = await import(
  moduleURL
);
const assert = (v: unknown, m: string) => {
  if (!v) throw Error(m);
};
for (const available of [true, false]) {
  Deno.test(
    "batch checkpoint: exact capability или полный old-Core fallback " +
      available,
    async () => {
      let full = 0, checks = 0, saved: any;
      const operation: any = {
        assertCurrent: async () => {
          full++;
        },
        withProjectContracts: async (_r: any, use: any) => {
          const life = { active: true };
          const batch = {
            groups: [],
            metrics: { inspectCalls: 0, fullWalks: 0, sourceBytesRead: 0 },
            ...(available
              ? {
                checkpoint: async () => {
                  if (!life.active) throw Error("EXPIRED_OLD_TOKEN");
                  checks++;
                },
              }
              : {}),
          };
          try {
            return await use(batch);
          } finally {
            life.active = false;
          }
        },
      };
      await withNativeProjectPlans(
        {},
        "/owner",
        [],
        { projects: [] },
        async (_p: any, checkpoint: any) => {
          saved = checkpoint;
          for (let i = 0; i < 7; i++) await checkpoint();
        },
        operation,
      );
      assert(
        available ? checks === 7 && full === 0 : checks === 0 && full === 7,
        "Неверная граница повторных checks",
      );
      if (available) {
        let refused = false;
        try {
          await saved();
        } catch (e) {
          refused = String(e).includes("EXPIRED_OLD_TOKEN");
        }
        assert(refused && full === 0, "Expired capability заменена fallback");
        await withNativeProjectPlans(
          {},
          "/owner",
          [],
          { projects: [] },
          async () => {
            let e = "";
            try {
              await saved();
            } catch (x) {
              e = String(x);
            }
            assert(
              e.includes("EXPIRED_OLD_TOKEN"),
              "Старый token ожил в новой batch",
            );
          },
          operation,
        );
      }
    },
  );
}
Deno.test("closing rejection после stage discards и не publish", async () => {
  const events: string[] = [];
  const sentinel = Error("CLOSING_FENCE_SENTINEL");
  let error: any;
  try {
    await withNativeStagedOutput(async (save: any) => {
      save({
        publish: async () => events.push("publish"),
        discard: async () => events.push("discard"),
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
