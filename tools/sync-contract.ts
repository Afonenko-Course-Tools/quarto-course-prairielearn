// Генерация только объявлений словаря CUE; это инструмент сопровождения схемы.
// Экспорт и компиляция учебного курса сюда не входят.
const root = new URL("../", import.meta.url);
const name = "prairielearn";
const extension = new URL(`_extensions/course-${name}/`, root);
const contract = JSON.parse(await Deno.readTextFile(new URL("contract.json", extension)));
const vocabulary = contract.vocabulary;
const quote = (value: string) => JSON.stringify(value);
const union = (values: string[]) => values.map(quote).join(" | ");
const definitions = {
  PrairieLearnTarget: quote(contract.name),
  PrairieLearnGrading: union(vocabulary.grading),
  PrairieLearnLabel: `string & =~${quote(vocabulary.assignment_label_pattern)}`,
};
const marker = "// BEGIN GENERATED VOCABULARY";
const end = "// END GENERATED VOCABULARY";
const block = [marker, "// Источник: contract.json; изменить: quarto run tools/sync-contract.ts.",
  ...Object.entries(definitions).map(([key, value]) => `#${key}: ${value}`), end].join("\n");
const path = new URL(contract.rules, extension);
const previous = await Deno.readTextFile(path);
const start = previous.indexOf(marker), finish = previous.indexOf(end);
if (start < 0 || finish < start) throw new Error("В схеме отсутствуют границы генерируемого словаря");
const next = previous.slice(0, start) + block + previous.slice(finish + end.length);
if (Deno.args.includes("--check")) {
  if (next !== previous) throw new Error("Словарь CUE устарел: выполните quarto run tools/sync-contract.ts");
  console.log("Словарь контракта и схема CUE согласованы");
} else {
  await Deno.writeTextFile(path, next);
  console.log("Словарь схемы CUE обновлён");
}
