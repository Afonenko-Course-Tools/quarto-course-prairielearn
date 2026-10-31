import * as Inventory from "../_extensions/course-prairielearn/application/verification-inventory.ts";
import { hash } from "../_extensions/course-prairielearn/application/source-selection.ts";

Deno.test("native verification связывает exact case bytes, scenarios и descriptor без sourcePath IO", async () => {
  const file = async (name: string, text: string) => ({
    name,
    bytes: new TextEncoder().encode(text),
    sha256: await hash(text),
  });
  const selection = {
    sources: [await file("Main.java", "class Main {}")],
    tests: [await file("src/test/java/Check.java", "class Check {}")],
    references: [{
      name: "reference",
      optional: false,
      files: [await file("Main.java", "class Main {int value=1;}")],
    }],
    descriptor: {
      schemaVersion: 1,
      sourceFiles: ["Main.java"],
      testFiles: ["src/test/java/Check.java"],
    },
    provenance: {
      studentOperation: "11111111-1111-4111-8111-111111111111",
      exerciseId: "exr-one",
      studentPlan: "22222222-2222-4222-8222-222222222222",
      fullPlan: "33333333-3333-4333-8333-333333333333",
    },
    contractCases: await file(
      "author/cases.json",
      JSON.stringify({
        schemaVersion: 1,
        cases: [{ id: "empty" }, { id: "edge" }],
      }),
    ),
  };
  const input = {
    courseId: "course",
    operation: "44444444-4444-4444-8444-444444444444",
    selections: { "exr-one": selection },
  };
  const result = await (Inventory as any).nativeVerificationInventory(input);
  const scenarios = result.scenarios.map((r: any) => r.scenario).sort();
  if (
    JSON.stringify(scenarios) !==
      JSON.stringify([
        "contract:edge",
        "contract:empty",
        "reference:reference",
        "starter",
      ])
  ) throw Error("verification scenarios lost or phantom API/demo points");
  const changed = structuredClone(input);
  changed.selections["exr-one"].descriptor.sourceFiles = ["Other.java"];
  const next = await (Inventory as any).nativeVerificationInventory(changed);
  if (result.inventoryHash === next.inventoryHash) {
    throw Error("descriptor not bound");
  }
  for (
    const mutate of [
      (v: any) => v.selections["exr-one"].sources[0].bytes[0]++,
      (v: any) => v.selections["exr-one"].provenance.exerciseId = "exr-foreign",
      (v: any) =>
        v.selections["exr-one"].references.push(
          v.selections["exr-one"].references[0],
        ),
      async (v: any) =>
        v.selections["exr-one"].contractCases = await file(
          "cases.json",
          JSON.stringify({
            schemaVersion: 1,
            cases: [{ id: "same" }, { id: "same" }],
          }),
        ),
    ]
  ) {
    const bad = structuredClone(input);
    await mutate(bad);
    let refused = false;
    try {
      await (Inventory as any).nativeVerificationInventory(bad);
    } catch {
      refused = true;
    }
    if (!refused) throw Error("forged native verification accepted");
  }
});
