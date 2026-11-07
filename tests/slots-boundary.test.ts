import { validateSlots } from "../_extensions/course-prairielearn/application/slots.ts";

const assignment = { requirement: "required", workMode: "individual" };
function rejects(value: unknown): void {
  let refused = false;
  try { validateSlots(value, "demo", "sec-lab"); } catch { refused = true; }
  if (!refused) throw Error("Неоднородная или превышающая Core limit позиция принята как Core slot");
}
Deno.test("PL slots отклоняет разреженный набор кандидатов из unknown", () => {
  const candidates = new Array<string>(2);
  candidates[1] = "exr-a";
  rejects([{ id: "alt-x", selection: "random", candidates, assignment }]);
});
Deno.test("PL slots сохраняет Core limits4096 до типизированного результата", () => {
  rejects([{ id: "alt-x", selection: "random", candidates: Array.from({ length: 4097 }, (_, i) => "exr-a" + i), assignment }]);
  rejects(Array.from({ length: 4097 }, (_, i) => ({ id: "exr-a" + i, selection: "fixed", candidates: ["exr-a" + i], assignment })));
});
