import { withNativeProjectPlans } from "../_extensions/course-prairielearn/application/native-course.ts";
const assert = (v: unknown, m: string) => {
  if (!v) throw Error(m);
};
for (const narrow of [true, false]) {
  Deno.test(`project plans выбирают ${narrow ? "contract" : "legacy"} batch без изменения student/full и metrics`, async () => {
    const events: string[] = [],
      contexts = [{ input: "/owner/projects/a/native-input.qmd" }, {
        input: "/owner/projects/b/native-input.qmd",
      }];
    let closed = false;
    const original = Object.freeze({
      inspectCalls: 1,
      fullWalks: 0,
      sourceBytesRead: 32,
    });
    const batch = {
      groups: [{ contexts }],
      get metrics() {
        return closed
          ? Object.freeze({ ...original, fullFences: 2 })
          : original;
      },
    };
    const operation: any = {
      token: 17,
      async withProjectContexts(requests: any, use: any) {
        assert(this === operation, "Потерян receiver");
        events.push("legacy");
        assert(requests[0].inputs.length === 2, "Потеряна группировка");
        const result = await use(batch);
        closed = true;
        return result;
      },
    };
    if (narrow) {
      operation.withProjectContracts = async function (
        requests: any,
        use: any,
      ) {
        assert(this === operation, "Потерян receiver");
        events.push("contract");
        assert(requests[0].inputs.length === 2, "Потеряна группировка");
        const result = await use(batch);
        closed = true;
        return result;
      };
    }
    const Core = {
      async planProject(context: any, choice: any) {
        assert(contexts.includes(context), "Подменён context");
        events.push(choice.audience);
        return { input: context.input, audience: choice.audience };
      },
    };
    const result = await withNativeProjectPlans(Core, "/owner", ["student"], {
      projects: contexts.map((c, i) => ({
        source: "bank.qmd",
        format: "html",
        fact: {
          projectRoot: "projects/" + (i ? "b" : "a"),
          exerciseId: "exr-" + i,
        },
      })),
    }, async (plans) => {
      assert(
        plans.length === 2 &&
          plans.every((p) =>
            p.student.audience === "student" && p.full.audience === "full"
          ),
        "Изменена парность планов",
      );
      events.push("use");
      return "exact";
    }, operation);
    assert(
      events.join(",") ===
        `${narrow ? "contract" : "legacy"},student,full,student,full,use`,
      "Неверный API selection/order",
    );
    assert(
      result.value === "exact" &&
        result.projectContextMetrics.inside === original &&
        result.projectContextMetrics.final.fullFences === 2,
      "Metrics не являются прежними inside/final observations",
    );
  });
}
Deno.test("ошибка contract batch сохраняется без silent legacy retry", async () => {
  const sentinel = Error("original contract failure");
  let legacy = 0, caught: unknown;
  try {
    await withNativeProjectPlans(
      {},
      "/owner",
      [],
      { projects: [] },
      async () => {},
      {
        withProjectContracts: async () => {
          throw sentinel;
        },
        withProjectContexts: async () => {
          legacy++;
        },
      },
    );
  } catch (e) {
    caught = e;
  }
  assert(caught === sentinel && legacy === 0, "Ошибка скрыта fallback");
});
Deno.test("feature check принимает contract API без legacy метода", async () => {
  const metrics = { inspectCalls: 0, fullWalks: 0, sourceBytesRead: 0 };
  const result = await withNativeProjectPlans(
    {},
    "/owner",
    [],
    { projects: [] },
    async () => "exact",
    {
      withProjectContracts: async (_r: any, use: any) =>
        await use({ groups: [], metrics }),
    },
  );
  assert(
    result.value === "exact" && result.projectContextMetrics.final === metrics,
    "Feature check требует отсутствующий legacy метод",
  );
});
