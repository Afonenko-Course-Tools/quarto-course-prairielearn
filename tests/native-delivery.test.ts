import { nativeAnswerBinding } from "../_extensions/course-prairielearn/application/native-delivery.ts";
const slot = { name: "answer", type: "numeric", anchor: "public-response" },
  answer = {
    type: "numeric",
    key: { value: 734129, tolerance: { absolute: 0 } },
  };
Deno.test("native binding не переносит private key и закрывает несовместимые slots/method", () => {
  const good = nativeAnswerBinding(
    "00000000-0000-4000-8000-000000000000",
    "external",
    answer,
    [slot],
  );
  if (
    JSON.stringify(good).includes("734129") ||
    good.upstreamGradingMethod !== "Internal"
  ) throw Error("key leaked");
  for (
    const [method, slots] of [
      ["manual", [slot]],
      ["external", []],
      ["external", [{ ...slot, key: 42 }]],
      ["external", [{ ...slot, name: "foreign" }]],
      ["external", [slot, slot]],
    ] as any[]
  ) {
    let refused = false;
    try {
      nativeAnswerBinding("uuid", method, answer, slots);
    } catch {
      refused = true;
    }
    if (!refused) throw Error("mutant accepted");
  }
});
Deno.test("capture consumer не содержит callback escape/executable/environment", async () => {
  const s = await Deno.readTextFile(
    new URL(
      "../_extensions/course-prairielearn/application/native-entry.ts",
      import.meta.url,
    ),
  );
  const seam = s.slice(
    s.indexOf("await lease.captureInputs("),
    s.indexOf(
      "await lease.assert(descriptor)",
      s.indexOf("await lease.captureInputs("),
    ),
  );
  if (
    seam.includes("Deno.Command") || seam.includes("env:") ||
    seam.includes("cwd:") || !seam.includes("timeoutMs:")
  ) throw Error("unchecked child callback returned");
});
