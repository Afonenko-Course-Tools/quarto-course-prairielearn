import { withNativeProjectPlans } from "../_extensions/course-prairielearn/application/native-course.ts";
// Только inert refusals: эти fixtures не являются genuine operation/contexts.
Deno.test("missing public operation A1 refuses without standalone fallback", async () => {
  let legacyCalls = 0;
  const Core = {
    readProjectContexts() {
      legacyCalls++;
      throw Error("legacy fallback");
    },
  };
  let error = "";
  try {
    await withNativeProjectPlans(
      Core,
      "/owner",
      [],
      { projects: [] },
      async () => {},
      {},
    );
  } catch (e) {
    error = String(e);
  }
  if (
    !error.includes("PL.NATIVE_PROJECT_CONTEXT_REUSE_REQUIRED") || legacyCalls
  ) throw Error("missing API used legacy fallback");
});
Deno.test("missing batch observations remain unavailable rather than zero", async () => {
  let error = "";
  try {
    await withNativeProjectPlans(
      {},
      "/owner",
      [],
      { projects: [] },
      async () => {},
      { withProjectContexts: async () => undefined },
    );
  } catch (e) {
    error = String(e);
  }
  if (!error.includes("PL.NATIVE_METRICS_UNAVAILABLE")) {
    throw Error("unobserved metrics guessed");
  }
});
Deno.test("non numeric observation cannot become accepted cost DTO", async () => {
  let error = "";
  try {
    await withNativeProjectPlans(
      {},
      "/owner",
      [],
      { projects: [] },
      async () => {},
      {
        withProjectContexts: async (_r: any, use: any) =>
          await use({
            groups: [],
            metrics: {
              inspectCalls: "unknown",
              fullWalks: 0,
              sourceBytesRead: 0,
            },
          }),
      },
    );
  } catch (e) {
    error = String(e);
  }
  if (!error.includes("PL.NATIVE_METRICS_UNAVAILABLE")) {
    throw Error("unknown metric became zero");
  }
});
