import { canonical } from "../_extensions/course-prairielearn/application/source-selection.ts";

Deno.test("canonical отклоняет root без JSON-представления", () => {
  for (const value of [undefined, () => 1, Symbol("root")]) {
    let refused = false;
    try {
      canonical(value);
    } catch (error) {
      refused = error instanceof TypeError && /JSON/.test(error.message);
    }
    if (!refused) throw Error("Root без JSON-представления не отклонён");
  }
});

Deno.test(
  "canonical сохраняет прежний порядок Unicode и вложенную JSON-семантику",
  () => {
    const cases: readonly [unknown, string][] = [
      [
        { z: undefined, b: [null, true, -0, Infinity], a: "строка" },
        '{"a":"строка","b":[null,true,0,null]}',
      ],
      [{ "\u{10000}": 2, "\ue000": 1 }, '{"":1,"𐀀":2}'],
      [
        [undefined, () => 1, Symbol("nested"), { z: 2, a: 1 }],
        '[,,,{"a":1,"z":2}]',
      ],
      [
        { a: undefined, b: () => 1, c: Symbol("nested") },
        '{"b":undefined,"c":undefined}',
      ],
      [null, "null"],
    ];
    for (const [value, expected] of cases) {
      if (canonical(value) !== expected) {
        throw Error("Изменилась существующая JSON-семантика canonical");
      }
    }
  },
);
