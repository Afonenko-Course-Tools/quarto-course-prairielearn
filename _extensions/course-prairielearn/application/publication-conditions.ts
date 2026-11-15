/** Уже выбранные публичные bytes условия; без собственной истории/сертификата источника. */
const fail = (message: string): never => {
  throw Error("PL publication conditions: " + message);
};
export type PublicationCondition = { target: string; data: Uint8Array };
export function publicationConditionFile(
  id: string,
  artifact?: PublicationCondition,
) {
  if (artifact === undefined) return;
  if (
    !/^exr-[a-z0-9][a-z0-9-]*$/.test(id) ||
    artifact.target !== id + "-conditions.zip" ||
    !(artifact.data instanceof Uint8Array) ||
    !artifact.data.length
  )
    fail("Небезопасный client target/bytes");
  return {
    file: { name: artifact.target, data: artifact.data },
    html:
      '<p><a href="{{options.client_files_question_url}}/' +
      encodeURIComponent(artifact.target) +
      '">Скачать условие для локального просмотра</a></p>',
  };
}
