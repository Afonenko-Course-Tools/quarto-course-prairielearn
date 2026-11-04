// Функциональный selected-file переносит текущие байты и точные имена.
import { Buffer } from "node:buffer";
import type * as CorePublic from "course-core/public.ts";
import { pathToFileURL } from "node:url";
const Core: typeof CorePublic = await import(
  pathToFileURL(Deno.args[0] + "/_extensions/course-core/public.ts").href
);
const { ArtifactFileSchema } = Core;
import { selectedCheckFile } from "../_extensions/course-prairielearn/application/native-check-inventory.ts";
const bytes = new TextEncoder().encode("package example; class Study {}\n");
const file = ArtifactFileSchema.parse({
  target: "src/main/java/example/Study.java",
  reason: "starter",
  audience: "student",
  bytes,
});
const selected = selectedCheckFile(file, "example/Study.java");
if (
  selected.name !== "example/Study.java" || selected.target !== file.target ||
  !Buffer.from(selected.data, "base64").equals(bytes)
) throw Error("selected filename/target/content lost");
if (Object.keys(selected).sort().join(",") !== "data,name,target") {
  throw Error("selected contract includes obsolete proof fields");
}
const changed = selectedCheckFile({
  ...file,
  bytes: new TextEncoder().encode("class Revised {}"),
}, "example/Study.java");
if (changed.data === selected.data) {
  throw Error("current bytes not transferred");
}
for (
  const extra of [
    { sha256: "a".repeat(64) },
    { rawSource: "private/raw.java" },
    { size: bytes.length },
  ]
) {
  if (ArtifactFileSchema.safeParse({ ...file, ...extra }).success) {
    throw Error("obsolete artifact field accepted");
  }
}
console.log(
  JSON.stringify({
    selectedFilename: selected.name,
    currentBytes: true,
    obsoleteFieldsRejected: 3,
  }),
);
