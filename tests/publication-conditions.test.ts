import { publicationConditionFile } from "../_extensions/course-prairielearn/application/publication-conditions.ts";
const zip = Uint8Array.from(
  atob(
    "UEsDBBQAAAAAACRtWF2/c6wWXgAAAF4AAAAKAAAAaW5kZXguaHRtbDwhZG9jdHlwZSBodG1sPjx0aXRsZT7Qo9GB0LvQvtCy0LjQtTwvdGl0bGU+PHA+0KHQuNC90YLQtdGC0LjRh9C10YHQutC40Lkg0LrQvtC80L/Qu9C10LrRgjwvcD5QSwECFAMUAAAAAAAkbVhdv3OsFl4AAABeAAAACgAAAAAAAAAAAAAAgAEAAAAAaW5kZXguaHRtbFBLBQYAAAAAAQABADgAAACGAAAAAAA=",
  ),
  (c) => c.charCodeAt(0),
);

Deno.test("выбранный ZIP условия сохраняет байты, имя и обычную ссылку", () => {
  const result = publicationConditionFile("exr-a", {
    target: "exr-a-conditions.zip",
    data: zip,
  });
  if (
    !result ||
    result.file.data !== zip ||
    result.file.name !== "exr-a-conditions.zip" ||
    !result.html.includes(
      "{{options.client_files_question_url}}/exr-a-conditions.zip",
    ) ||
    publicationConditionFile("exr-a") !== undefined
  )
    throw Error("condition presentation lost");
});
Deno.test("представление условия отвергает чужие пути и пустой архив", () => {
  for (const target of [
    "../escape.zip",
    "foreign.zip",
    "starter.zip",
    "exr-a-conditions.zip?x",
  ]) {
    let denied = false;
    try {
      publicationConditionFile("exr-a", { target, data: zip });
    } catch {
      denied = true;
    }
    if (!denied) throw Error("unsafe condition accepted");
  }
  let denied = false;
  try {
    publicationConditionFile("exr-a", {
      target: "exr-a-conditions.zip",
      data: new Uint8Array(),
    });
  } catch {
    denied = true;
  }
  if (!denied) throw Error("empty condition accepted");
});
