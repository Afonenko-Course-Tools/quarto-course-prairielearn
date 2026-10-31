import { posix } from "node:path";
import { hash, safePath } from "./source-selection.ts";
/** Прежняя Core checks canonical область; localeCompare сохранён буквально. */
export function checksCanonical(value: any): string {
  if (Array.isArray(value)) {
    return "[" + value.map(checksCanonical).join(",") + "]";
  }
  if (value && typeof value === "object") {
    return "{" + Object.entries(value).filter(([, v]) =>
      v !== undefined
    ).sort(([a], [b]) =>
      a.localeCompare(b)
    ).map(([k, v]) =>
      JSON.stringify(k) + ":" + checksCanonical(v)
    ).join(",") + "}";
  }
  return JSON.stringify(value);
}
/** Только value projection уже выбранного raw copy; не даёт operation/A1 authority
 * и никогда не читает rawSource. Production integration должна получать inventory
 * непосредственно от guarded materializeProject в живом callback той же операции.
 * Shared origin пока явно отказывает: legacy projectRelativePath не выражает его.
 */
export async function nativeRawSourceSelection(
  input: {
    Core: any;
    file: unknown;
    projectRoot: string;
    submissionRelativePath: string;
    sourceRows: readonly { source: string; sha256: string }[];
  },
) {
  const file = input.Core.ArtifactFileSchema.parse(input.file);
  if (
    !safePath(input.projectRoot) || !safePath(input.submissionRelativePath) ||
    !safePath(file.rawSource)
  ) {
    throw Error(
      "PL.NATIVE_ORIGIN_UNQUALIFIED: explicit project/submission/raw source required",
    );
  }
  const rows = new Map<string, string>();
  for (const row of input.sourceRows) {
    if (!safePath(row.source) || rows.has(row.source)) {
      throw Error("PL.NATIVE_ORIGIN_UNQUALIFIED: repeated/unsafe same-S row");
    }
    rows.set(row.source, row.sha256);
  }
  if (
    file.size !== file.bytes.length ||
    rows.get(file.rawSource) !== file.sha256 ||
    await hash(file.bytes) !== file.sha256
  ) {
    throw Error(
      "PL.NATIVE_ORIGIN_UNQUALIFIED: missing/foreign/changed same-S raw bytes",
    );
  }
  const path = posix.relative(input.projectRoot, file.rawSource);
  if (!safePath(path)) {
    throw Error(
      "PL.NATIVE_ORIGIN_OUTSIDE_PROJECT: shared raw source cannot be represented by legacy projectRelativePath: " +
        file.rawSource,
    );
  }
  return {
    projectRelativePath: path,
    submissionRelativePath: input.submissionRelativePath,
    sha256: file.sha256,
  };
}
/** Структура/hash-область v1; не создаёт valid CheckProject и не публикует manifest.
 * Projects должны поступить из отдельной reviewed native policy projection.
 */
export async function nativeChecksManifest(
  input: {
    courseId: string;
    bookRoot: string;
    sources: { source: string; sha256: string }[];
    projects: any[];
  },
) {
  const sources = [...input.sources].sort((a, b) =>
    a.source.localeCompare(b.source)
  );
  const projects = [...input.projects].sort((a, b) =>
    a.qualifiedId.localeCompare(b.qualifiedId)
  );
  if (
    new Set(sources.map((s) => s.source)).size !== sources.length ||
    new Set(projects.map((p) => p.qualifiedId)).size !== projects.length
  ) throw Error("PL.CHECKS_INVALID: duplicate normalized scope");
  return {
    schemaVersion: 1,
    courseId: input.courseId,
    bookRoot: input.bookRoot,
    sourceSnapshotHash: await hash(checksCanonical({ sources, projects })),
    inventoryHash: await hash(checksCanonical(projects)),
    projects,
  };
}
