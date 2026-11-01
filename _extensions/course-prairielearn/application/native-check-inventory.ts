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
 * Version2 выражает shared origin явно; legacy1 его отклоняет.
 */
export async function nativeRawSourceSelection(
  input: {
    Core: any;
    file: unknown;
    projectRoot: string;
    submissionRelativePath: string;
    sourceRows: readonly { source: string; sha256: string }[];
    version?: 1 | 2;
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
  if (!safePath(path) && input.version !== 2) {
    throw Error(
      "PL.NATIVE_ORIGIN_OUTSIDE_PROJECT: shared raw source cannot be represented by legacy projectRelativePath: " +
        file.rawSource,
    );
  }
  return {
    ...(safePath(path)
      ? { projectRelativePath: path }
      : { ownerRelativePath: file.rawSource }),
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
    version?: 1 | 2;
    selectionScope?: any;
  },
) {
  const sources = [...input.sources].sort((a, b) =>
    a.source.localeCompare(b.source)
  );
  let projects = [...input.projects].sort((a, b) =>
    a.qualifiedId.localeCompare(b.qualifiedId)
  );
  if (
    new Set(sources.map((s) => s.source)).size !== sources.length ||
    new Set(projects.map((p) => p.qualifiedId)).size !== projects.length
  ) throw Error("PL.CHECKS_INVALID: duplicate normalized scope");
  let selectionScope, selectionScopeHash;
  if (input.version === 2) {
    selectionScope = input.selectionScope;
    const expected = projects.map((p) => p.qualifiedId);
    if (
      !selectionScope ||
      selectionScope.schema !== "pl-native-selected-checks-v1" ||
      JSON.stringify(selectionScope.automaticIds) !==
        JSON.stringify(expected) ||
      checksCanonical(selectionScope.sources) !== checksCanonical(sources) ||
      new Set(
          selectionScope.assessments.map((a: any) => a.source + "\0" + a.id),
        ).size !== selectionScope.assessments.length
    ) {
      throw Error("PL.CHECKS_INVALID: exact selected automatic scope required");
    }
    selectionScopeHash = await hash(checksCanonical(selectionScope));
  } else if (input.selectionScope) {
    throw Error("PL.CHECKS_INVALID: native scope cannot be downgraded");
  }
  return {
    schemaVersion: input.version ?? 1,
    ...(selectionScope ? { selectionScope, selectionScopeHash } : {}),
    courseId: input.courseId,
    bookRoot: input.bookRoot,
    sourceSnapshotHash: await hash(
      checksCanonical({
        sources,
        projects: input.version === 2
          ? projects.map(legacyChecksProject)
          : projects,
      }),
    ),
    inventoryHash: await hash(
      checksCanonical(
        input.version === 2 ? projects.map(legacyChecksProject) : projects,
      ),
    ),
    projects,
  };
}

/** Прежние CheckProject поля. Native transport/intent не входит в hash scope. */
export function legacyChecksProject(value: any) {
  const {
    selectionOriginVersion: _v,
    nativePlanGroups: _g,
    selectionScopeHash: _s,
    ...project
  } = value;
  return {
    ...project,
    references: project.references.map((ref: any) => {
      const { group: _g, targets: _t, ...legacy } = ref;
      return legacy;
    }),
    contractFixtures: project.contractFixtures.map((file: any) => {
      const { logicalTarget: _t, ...legacy } = file;
      return legacy;
    }),
    ...(project.contractCasesHash
      ? {
        contractCasesHash: (() => {
          const { logicalTarget: _t, ...legacy } = project.contractCasesHash;
          return legacy;
        })(),
      }
      : {}),
  };
}
