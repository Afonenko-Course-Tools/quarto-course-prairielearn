import { isDeepStrictEqual } from "node:util";
import type { StudentArtifact } from "./export-types.ts";
import { assertPublicStudentFiles } from "./export-files.ts";

/** Сохраняет проверенное соответствие Core target и имени сдачи без изменения bytes. */
export function withStudentSubmissionNames(
  artifact: StudentArtifact,
  sources: readonly { name: string; target: string; bytes: Uint8Array }[],
): StudentArtifact {
  return {
    ...artifact,
    files: artifact.files.map((file) => {
      const source = sources.find(
        (source) =>
          source.target === file.name &&
          isDeepStrictEqual(source.bytes, file.bytes),
      );
      return source ? { ...file, submissionName: source.name } : file;
    }),
  };
}

/** Исключает только файл, уже доступный в starter под тем же или проверенным именем. */
export function additionalStudentFiles(
  student: { name: string; data: Uint8Array }[],
  artifact?: StudentArtifact,
) {
  const additional = student.filter(
    (file) =>
      !artifact?.files.some(
        (bundled) =>
          (bundled.name === file.name ||
            bundled.submissionName === file.name) &&
          isDeepStrictEqual(bundled.bytes, file.data),
      ),
  );
  if (artifact) assertPublicStudentFiles(additional);
  return additional;
}
