import { withNativeProjectPlans } from "../_extensions/course-prairielearn/application/native-course.ts";
const assert = (v: unknown, m: string) => {
  if (!v) throw Error(m);
};
for (const withContextMethod of [true, false]) {
  Deno.test(`project plans используют contract batch ${withContextMethod ? "с дополнительным context методом" : "без обращения к context методу"} и сохраняют student/full и metrics`, async () => {
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
      async withProjectContracts(requests: any, use: any) {
        assert(this === operation, "Потерян receiver");
        events.push("contract");
        assert(requests[0].inputs.length === 2, "Потеряна группировка");
        const result = await use(batch);
        closed = true;
        return result;
      },
    };
    if (withContextMethod) {
      operation.withProjectContexts = async () => {
        throw Error("Текущий NativeOperation не требует legacy выбора");
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
        "contract,student,full,student,full,use",
      "Неверный contract API/order",
    );
    assert(
      result.value === "exact" &&
        result.projectContextMetrics.inside === original &&
        result.projectContextMetrics.final.fullFences === 2,
      "Metrics не являются прежними inside/final observations",
    );
  });
}
