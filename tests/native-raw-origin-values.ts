// Value controls: никакой fake operation/lease/A1/profile qualification.
import { pathToFileURL } from "node:url";
import {
  nativeChecksManifest,
  nativeRawSourceSelection,
} from "../_extensions/course-prairielearn/application/native-check-inventory.ts";
import { hash } from "../_extensions/course-prairielearn/application/source-selection.ts";
const Core = await import(
  pathToFileURL(Deno.args[0] + "/_extensions/course-core/public.ts").href
);
// Private legacy canonical oracle только в test; production импортирует лишь public Core.
const Legacy = await import(
  pathToFileURL(
    Deno.args[0] + "/_extensions/course-core/project-checks/collect.ts",
  ).href
);
const bytes = new TextEncoder().encode("class Main {}"),
  digest = await hash(bytes);
const file = {
  target: "src/main/java/Main.java",
  rawSource: "projects/p/starter/src/main/java/Main.java",
  reason: "starter",
  audience: "student",
  bytes,
  size: bytes.length,
  sha256: digest,
};
const input = {
  Core,
  file,
  projectRoot: "projects/p",
  submissionRelativePath: "Main.java",
  sourceRows: [{ source: file.rawSource, sha256: digest }],
};
let reads = 0;
const read = Deno.readFile, readText = Deno.readTextFile;
Deno.readFile = ((..._args: any[]) => {
  reads++;
  throw Error("unexpected origin read");
}) as any;
Deno.readTextFile = Deno.readFile as any;
let selected;
let refusals = 0;
try {
  selected = await nativeRawSourceSelection(input);
  if (
    selected.projectRelativePath !== "starter/src/main/java/Main.java" ||
    selected.submissionRelativePath !== "Main.java" ||
    selected.projectRelativePath === file.target
  ) throw Error("target substituted for actual raw source");
  for (
    const mutate of [
      (v: any) => delete v.file.rawSource,
      (v: any) => v.file.rawSource = "../foreign.java",
      (v: any) => v.sourceRows = [],
      (v: any) => v.sourceRows[0].sha256 = "f".repeat(64),
      (v: any) => v.file.bytes[0] ^= 1,
      (v: any) => v.file.size++,
      (v: any) => v.sourceRows.push(v.sourceRows[0]),
      (v: any) => v.submissionRelativePath = "../escape",
    ]
  ) {
    const bad = structuredClone({ ...input, Core: undefined });
    bad.Core = Core;
    mutate(bad);
    let error = "";
    try {
      await nativeRawSourceSelection(bad);
    } catch (e) {
      error = String(e);
    }
    if (!error) throw Error("origin mutation accepted");
    refusals++;
  }
  const shared = structuredClone({ ...input, Core: undefined });
  shared.Core = Core;
  shared.file.rawSource =
    "projects/common/java/api-support/src/api/java/org/prairielearn/api/PlatformApiPrecheck.java";
  shared.sourceRows = [{ source: shared.file.rawSource, sha256: digest }];
  let error = "";
  try {
    await nativeRawSourceSelection(shared);
  } catch (e) {
    error = String(e);
  }
  if (!error.includes("PL.NATIVE_ORIGIN_OUTSIDE_PROJECT")) {
    throw Error("shared legacy origin not refused: " + error);
  }
} finally {
  Deno.readFile = read;
  Deno.readTextFile = readText;
}
const sources = [{ source: "work.qmd", sha256: "a".repeat(64) }],
  projects = [{
    qualifiedId: "course/exr-p",
    sources: [selected],
    check: {
      limits: { "outer-seconds": 30 },
      runtime: "java25-gradle-junit-v1",
    },
  }];
const manifest = await nativeChecksManifest({
  courseId: "course",
  bookRoot: "tasks",
  sources,
  projects,
});
if (
  manifest.sourceSnapshotHash !==
    await hash(Legacy.canonical({ sources, projects })) ||
  manifest.inventoryHash !== await hash(Legacy.canonical(projects))
) throw Error("legacy hash scope/normalizer differs");
const other = await nativeChecksManifest({
  courseId: "course",
  bookRoot: "tasks",
  sources: [{ ...sources[0], sha256: "b".repeat(64) }],
  projects,
});
if (
  other.inventoryHash !== manifest.inventoryHash ||
  other.sourceSnapshotHash === manifest.sourceSnapshotHash
) throw Error("source hash scope collapsed");
const changed = await nativeChecksManifest({
  courseId: "course",
  bookRoot: "tasks",
  sources,
  projects: [{ ...projects[0], source: "other.qmd" }],
});
if (
  changed.inventoryHash === manifest.inventoryHash ||
  changed.sourceSnapshotHash === manifest.sourceSnapshotHash
) throw Error("project hash scope lost");
console.log(JSON.stringify(
  {
    status: "VALUE_AND_HASH_SCOPE_ONLY_NOT_NATIVE_AUTHORITY",
    refusals,
    sharedOriginLegacyRefused: true,
    sourceReads: reads,
    actualCoreLegacyCanonicalParity: true,
    targetNotSource: true,
    hashScopesDistinct: true,
  },
  null,
  2,
));
