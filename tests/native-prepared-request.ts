// Чистый DTO-контроль; не lease/operation и не positive producer qualification.
import { pathToFileURL } from "node:url";
import * as PL from "../_extensions/course-prairielearn/application/native-adapter.ts";
const Core = await import(
  pathToFileURL(Deno.args[0] + "/_extensions/course-core/public.ts").href
);
const A = "11111111-1111-4111-8111-111111111111",
  B = "22222222-2222-4222-8222-222222222222";
const descriptor = {
  schema: "course-native-prepared-operation-v1",
  root: "/owner",
  outputDirectory: "/owner/_generated/render",
  identity: {
    operation: B,
    profiles: ["full", "practice"],
    projection: "author",
    runtime: "quarto-1.11.5",
  },
  inputs: [{
    source: "labs/work.qmd",
    captureWitness: "33333333-3333-4333-8333-333333333333",
  }],
  assessments: [{ source: "labs/work.qmd", id: "sec-work" }],
};
const request = await (PL as any).nativePreparedRequest(Core, descriptor);
if (
  request.identity.operation !== B || JSON.stringify(request).includes(A) ||
  request.inputs[0].captureWitness !== descriptor.inputs[0].captureWitness ||
  request.outputDirectory !== descriptor.outputDirectory
) throw Error("new request B not derived from descriptor B");
for (
  const mutate of [
    (v: any) => v.extra = true,
    (v: any) => v.identity.operation = "bad",
    (v: any) => v.inputs[0].captureWitness = "bad",
  ]
) {
  const bad = structuredClone(descriptor);
  mutate(bad);
  let refused = false;
  try {
    await (PL as any).nativePreparedRequest(Core, bad);
  } catch {
    refused = true;
  }
  if (!refused) throw Error("malformed prepared DTO accepted");
}
console.log(
  JSON.stringify(
    {
      status: "VALUE_ONLY_NOT_NATIVE_LEASE_OR_POSITIVE",
      newIdentity: B,
      oldIdentityUsed: false,
      checks: 4,
    },
    null,
    2,
  ),
);
