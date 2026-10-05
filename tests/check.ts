import {
  renderNative,
  selectedDocument,
  verifyInstalled,
} from "./native-render.ts";
import { dirname, fromFileUrl, join, resolve } from "stdlib/path";

const root = dirname(dirname(fromFileUrl(import.meta.url)));
if (Deno.args.length !== 1) {
  throw new Error(
    "Запуск: quarto run tests/check.ts ПУТЬ_К_РЕПОЗИТОРИЮ_COURSE_CORE",
  );
}
const coreRepository = resolve(Deno.args[0]);
const core = join(coreRepository, "_extensions/course-core");
const adapter = join(root, "_extensions/course-prairielearn");
const quarto = Deno.env.get("QUARTO") || "quarto";
const cue = Deno.env.get("CUE") || "cue";
const directory = await Deno.makeTempDir({ prefix: "course-pl-policy-" });
const decoder = new TextDecoder();

async function copy(source: string, destination: string): Promise<void> {
  await Deno.mkdir(destination, { recursive: true });
  for await (const entry of Deno.readDir(source)) {
    const input = join(source, entry.name),
      output = join(destination, entry.name);
    if (entry.isDirectory) await copy(input, output);
    else if (entry.isFile) await Deno.copyFile(input, output);
  }
}

let renderedRoot = directory;
let cueAttempt = 0;
async function command(executable: string, args: string[], cwd = directory) {
  if (executable === quarto && args[0] === "render") {
    const at = args.indexOf("--profile");
    const profile = at < 0 ? "full" : args[at + 1] as "student" | "full";
    const result = await renderNative(cwd, profile);
    renderedRoot = result.stage;
    return result;
  }
  const result = await new Deno.Command(executable, {
    args,
    cwd,
    stdout: "piped",
    stderr: "piped",
  }).output();
  const text = decoder.decode(result.stdout) + decoder.decode(result.stderr);
  const evidence = Deno.env.get("ADAPTER_EVIDENCE");
  if (executable === cue && evidence) {
    await Deno.mkdir(evidence, { recursive: true });
    await Deno.writeTextFile(
      join(evidence, `cue-${++cueAttempt}.json`),
      JSON.stringify({ args, ok: result.success, text }, null, 2),
    );
  }
  return { ok: result.success, text };
}

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function document(policy = ""): string {
  return `---
assessment:
  kind: test
${policy}---

# Контрольная {#sec-policy}

${
    ["experiment", "tests", "implementation"].map((id) =>
      `:::: {#exr-${id} target="prairielearn" course-role="independent-study" difficulty="introductory" project="/projects/example"}
## ${
        {
          experiment: "Эксперимент",
          tests: "Тестирование",
          implementation: "Реализация",
        }[id]
      }

Описание задания.
::::`
    ).join("\n\n")
  }

::: {.assessment-items}
1. @exr-experiment
2. @exr-tests
3. @exr-implementation
:::
`;
}

const policy = `  prairielearn:
    attempts: 3
    pass:
      at-least: 2
    assignment:
      student-label: essay-decoding
`;

try {
  for (const repository of [coreRepository, root]) {
    const result = await command(quarto, ["add", repository, "--no-prompt"]);
    assert(
      result.ok,
      `Установка расширения завершилась ошибкой:\n${result.text}`,
    );
  }
  await verifyInstalled(directory, root, "prairielearn");
  await Deno.mkdir(join(directory, "projects/example"), { recursive: true });
  await Deno.writeTextFile(
    join(directory, "_quarto.yml"),
    `project:
  type: default
  pre-render:
    - _extensions/course-core/entrypoints/pre.ts
  post-render: _extensions/course-core/entrypoints/post.ts
  render: [index.qmd]
format: html
lang: ru
course:
  id: policy-test
  validate: true
  adapters: [prairielearn]
filters: [course-core, course-prairielearn]
profile:
  default: full
  group: [[student, full]]
`,
  );
  for (const view of ["student", "full"]) {
    await Deno.writeTextFile(
      join(directory, `_quarto-${view}.yml`),
      `project:\n  output-dir: _book/${view}\ncourse:\n  view: ${view}\n`,
    );
  }

  await Deno.writeTextFile(join(directory, "index.qmd"), document(policy));
  let result = await command(quarto, ["render", "--fail-if-warnings"]);
  assert(
    result.ok,
    `Корректный QMD должен собираться и проходить проверку:\n${result.text}`,
  );
  const modelPath = () =>
    join(renderedRoot, "_generated/course-spec/course.json");
  const valid = JSON.parse(await Deno.readTextFile(modelPath()));
  assert(
    !("schema" in valid.course),
    "Модель не должна содержать переключатель версии course.schema",
  );
  assert(
    valid.exercises.every((
      e: { purpose: string; difficulty: string; sourceTopic: { id: string } },
    ) =>
      e.purpose === "independent-study" && e.difficulty === "introductory" &&
      e.sourceTopic.id === "sec-policy"
    ),
    "Потеряны назначение, сложность или авторская тема PrairieLearn",
  );
  const extracted = valid.assessments[0].extensions.prairielearn;
  assert(
    extracted.attempts === 3 && extracted.pass["at-least"] === 2 &&
      extracted.assignment["student-label"] === "essay-decoding" &&
      Object.keys(extracted).length === 3,
    "Правила контрольной должны сохранять числовые поля и способ назначения",
  );
  assert(
    valid.exercises.every((e: { extensions: unknown }) =>
      JSON.stringify(e.extensions) ===
        JSON.stringify({ prairielearn: { grading: "external" } })
    ),
    "Задания PrairieLearn должны содержать параметры внешней проверки",
  );
  console.log("ПРОЙДЕНО извлечение QMD: 3 задания, 2 для зачёта, 3 попытки");

  const orderConfigPath = join(directory, "_quarto.yml");
  const orderConfig = await Deno.readTextFile(orderConfigPath);
  await Deno.writeTextFile(
    orderConfigPath,
    orderConfig.replace(
      "filters: [course-core, course-prairielearn]",
      "filters: [course-prairielearn, course-core]",
    ),
  );
  result = await command(quarto, ["render", "--fail-if-warnings"]);
  assert(
    !result.ok && result.text.includes("course-core должен предшествовать"),
    "Неверный порядок фильтров должен отклоняться до извлечения",
  );
  await Deno.writeTextFile(orderConfigPath, orderConfig);
  console.log(
    "ПРОЙДЕНО: неверный порядок фильтров отклонён до извлечения закрытых данных",
  );

  const cases: [string, (model: typeof valid) => void][] = [
    ["ноль попыток", (m) => {
      m.assessments[0].extensions.prairielearn.attempts = 0;
    }],
    ["дробное число попыток", (m) => {
      m.assessments[0].extensions.prairielearn.attempts = 1.5;
    }],
    ["нечисловое значение попыток", (m) => {
      m.assessments[0].extensions.prairielearn.attempts = "много";
    }],
    ["нулевой порог", (m) => {
      m.assessments[0].extensions.prairielearn.pass["at-least"] = 0;
    }],
    ["дробный порог", (m) => {
      m.assessments[0].extensions.prairielearn.pass["at-least"] = 1.5;
    }],
    ["порог превышает число заданий", (m) => {
      m.assessments[0].extensions.prairielearn.pass["at-least"] = 4;
    }],
    ["отсутствующее поле", (m) => {
      delete m.assessments[0].extensions.prairielearn.attempts;
    }],
    ["неизвестное поле", (m) => {
      m.assessments[0].extensions.prairielearn.attemps = 3;
    }],
    ["неизвестное вложенное поле", (m) => {
      m.assessments[0].extensions.prairielearn.pass.extra = true;
    }],
    ["неверная метка", (m) => {
      m.assessments[0].extensions.prairielearn.assignment["student-label"] = "";
    }],
    ["логическое значение вместо правил", (m) => {
      m.assessments[0].extensions.prairielearn = false;
    }],
    ["задание с ручной проверкой", (m) => {
      m.exercises[0].target = "manual";
      m.exercises[0].authoredTarget = "manual";
      m.exercises[0].extensions = {};
    }],
  ];
  for (const [name, mutate] of cases) {
    const model = structuredClone(valid);
    mutate(model);
    await Deno.writeTextFile(
      join(directory, "candidate.json"),
      JSON.stringify(model),
    );
    result = await command(cue, [
      "vet",
      join(core, "spec/core.cue"),
      join(adapter, "spec/prairielearn.cue"),
      "candidate.json",
      "-d",
      "#Course",
      "-c",
    ]);
    assert(!result.ok, `Неверные данные должны отклоняться: ${name}`);
    if (name === "задание с ручной проверкой") {
      assert(
        result.text.includes("PL001_externalAssessmentMembers"),
        `Должно сработать правило состава PrairieLearn: ${result.text}`,
      );
    }
    console.log(`ПРОЙДЕНО, отклонено: ${name}`);
  }

  // Неизвестные поля сохраняются при извлечении: CUE должен отклонять
  // опечатки, а не пропускать их вместе с потерянными данными.
  await Deno.writeTextFile(
    join(directory, "index.qmd"),
    document(policy + "    attemps: 3\n"),
  );
  result = await command(quarto, ["render", "--fail-if-warnings"]);
  assert(
    !result.ok && result.text.includes("attemps"),
    "Неизвестные поля QMD должны отклоняться",
  );
  console.log(
    "ПРОЙДЕНО неизвестное поле QMD сохраняется при извлечении и отклоняется",
  );

  await Deno.writeTextFile(
    join(directory, "index.qmd"),
    document("  prairielearn: false\n"),
  );
  result = await command(quarto, ["render", "--fail-if-warnings"]);
  assert(
    !result.ok && result.text.includes("prairielearn") &&
      !result.text.includes("CORE.EXERCISE_"),
    `Явное значение false не должно трактоваться как отсутствие правил: ${result.text}`,
  );
  console.log("ПРОЙДЕНО правила со значением false отклоняются");

  await Deno.writeTextFile(join(directory, "index.qmd"), document());
  result = await command(quarto, ["render", "--fail-if-warnings"]);
  assert(
    result.ok,
    `Занятие без правил PrairieLearn должно проходить проверку:\n${result.text}`,
  );
  const withoutPolicy = JSON.parse(await Deno.readTextFile(modelPath()));
  assert(
    !("prairielearn" in withoutPolicy.assessments[0].extensions),
    "Неуказанные правила не должны появляться в модели",
  );
  console.log("ПРОЙДЕНО занятие без правил PrairieLearn");

  const config = await Deno.readTextFile(join(directory, "_quarto.yml"));
  const defaults = `prairielearn:
  assessment-defaults:
    attempts: 3
    pass:
      at-least: 2
    assignment:
      mode: assessment-id
`;
  await Deno.writeTextFile(join(directory, "_quarto.yml"), config + defaults);
  await Deno.writeTextFile(
    join(directory, "index.qmd"),
    document("  prairielearn: {}\n"),
  );
  result = await command(quarto, ["render", "--fail-if-warnings"]);
  assert(
    result.ok,
    `Явное подключение должно наследовать общие настройки:\n${result.text}`,
  );
  const derived = JSON.parse(await Deno.readTextFile(modelPath()));
  const derivedPolicy = derived.assessments[0].extensions.prairielearn;
  const label = derivedPolicy.assignment["student-label"];
  const digest = await crypto.subtle.digest(
    "SHA-1",
    new TextEncoder().encode("policy-test\0sec-policy"),
  );
  const expectedLabel = "pl-" +
    [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  assert(
    label === expectedLabel,
    "Вычисленная метка должна использовать документированный ключ",
  );
  assert(
    derivedPolicy.attempts === 3 && derivedPolicy.pass["at-least"] === 2 &&
      !("mode" in derivedPolicy.assignment),
    "В модель должны попадать только нормализованные поля",
  );
  console.log(
    "ПРОЙДЕНО явное подключение, наследование настроек и вычисление метки",
  );

  await Deno.writeTextFile(
    join(directory, "index.qmd"),
    document(`  prairielearn:
    attempts: 4
    assignment:
      student-label: essay-retake
`),
  );
  result = await command(quarto, ["render", "--fail-if-warnings"]);
  assert(
    result.ok,
    `Локальные правила должны переопределять общие настройки:\n${result.text}`,
  );
  const overridden =
    JSON.parse(await Deno.readTextFile(modelPath())).assessments[0].extensions
      .prairielearn;
  assert(
    overridden.attempts === 4 && overridden.pass["at-least"] === 2 &&
      overridden.assignment["student-label"] === "essay-retake",
    "Локальный способ назначения заменяет общую стратегию",
  );
  console.log("ПРОЙДЕНО переопределение локального поля и способа назначения");

  await Deno.writeTextFile(join(directory, "index.qmd"), document());
  result = await command(quarto, ["render", "--fail-if-warnings"]);
  assert(
    result.ok,
    `Занятие без подключения должно проходить проверку при наличии общих настроек:\n${result.text}`,
  );
  const unconnected = JSON.parse(await Deno.readTextFile(modelPath()));
  assert(
    !("prairielearn" in unconnected.assessments[0].extensions),
    "Общие настройки не должны подключаться неявно",
  );
  console.log(
    "ПРОЙДЕНО общие настройки не применяются к неподключённым занятиям",
  );

  await Deno.mkdir(join(directory, "nested"));
  await Deno.rename(
    join(directory, "index.qmd"),
    join(directory, "nested/moved.qmd"),
  );
  await Deno.writeTextFile(
    join(directory, "nested/moved.qmd"),
    document("  prairielearn: {}\n").replace(
      "# Контрольная",
      "# Новое название",
    ),
  );
  await Deno.writeTextFile(
    join(directory, "_quarto.yml"),
    (config + defaults).replace(
      "render: [index.qmd]",
      "render: [nested/moved.qmd]",
    ),
  );
  result = await command(quarto, ["render", "--fail-if-warnings"]);
  assert(result.ok, `Перемещённый QMD должен собираться:\n${result.text}`);
  assert(
    JSON.parse(await Deno.readTextFile(modelPath())).assessments[0].extensions
      .prairielearn.assignment["student-label"] === label,
    "Перемещение страницы и изменение заголовка не должны менять метку",
  );
  await Deno.rename(
    join(directory, "nested/moved.qmd"),
    join(directory, "index.qmd"),
  );
  await Deno.remove(join(directory, "nested"));
  await Deno.writeTextFile(join(directory, "_quarto.yml"), config + defaults);
  console.log(
    "ПРОЙДЕНО метка сохраняется после перемещения QMD и изменения заголовка",
  );

  const invalidQmd: [string, string, string][] = [
    [
      "неизвестный режим",
      `  prairielearn:\n    assignment:\n      mode: random\n`,
      defaults,
    ],
    [
      "два способа назначения одновременно",
      `  prairielearn:\n    assignment:\n      mode: assessment-id\n      student-label: explicit\n`,
      defaults,
    ],
    [
      "неизвестное поле исходника",
      `  prairielearn:\n    attemps: 5\n`,
      defaults,
    ],
    ["список вместо правил", `  prairielearn: []\n`, defaults],
    [
      "логическое значение вместо общих настроек",
      `  prairielearn: {}\n`,
      "prairielearn:\n  assessment-defaults: false\n",
    ],
    [
      "список вместо общих настроек",
      `  prairielearn: {}\n`,
      "prairielearn:\n  assessment-defaults: []\n",
    ],
  ];
  for (const [name, sourcePolicy, sourceDefaults] of invalidQmd) {
    await Deno.writeTextFile(
      join(directory, "_quarto.yml"),
      config + sourceDefaults,
    );
    await Deno.writeTextFile(
      join(directory, "index.qmd"),
      document(sourcePolicy),
    );
    result = await command(quarto, ["render", "--fail-if-warnings"]);
    assert(
      !result.ok && !result.text.includes("CORE.EXERCISE_") &&
        (result.text.includes("prairielearn") ||
          result.text.includes("assignment")),
      `Неверные авторские правила должны отклоняться адаптером: ${name}\n${result.text}`,
    );
    console.log(`ПРОЙДЕНО, отклонено: QMD ${name}`);
  }

  // Ядро применяет видимость до адаптера. Общие настройки не должны
  // превращать открытую демонстрацию в задание PrairieLearn.
  await Deno.writeTextFile(join(directory, "_quarto.yml"), config + defaults);
  for (const view of ["student", "full"]) {
    await Deno.writeTextFile(
      join(directory, `_quarto-${view}.yml`),
      `project:\n  output-dir: _book/${view}\ncourse:\n  view: ${view}\n`,
    );
  }
  const privateDocument = document("  prairielearn: {}\n")
    .replace(
      ":::: {#exr-experiment",
      ":::::: {.when-full}\n\n:::: {#exr-experiment",
    )
    .replace(
      "Описание задания.\n::::",
      `Описание задания.

::: {.grading-notes}
ЗАКРЫТЫЙ-КРИТЕРИЙ-ПРОВЕРКИ.
:::
::::`,
    ) + `
::::::

:::: {#exr-public-demo target="manual" course-role="demonstration" difficulty="introductory" project="/projects/example"}
## Открытая демонстрация

Условие открытой демонстрации.
::::
`;
  await Deno.writeTextFile(
    join(directory, "index.qmd"),
    privateDocument.replace(
      "  prairielearn: {}",
      "  prairielearn:\n    attempts: 0",
    ),
  );
  result = await command(quarto, [
    "render",
    "--profile",
    "student",
    "--fail-if-warnings",
  ]);
  assert(
    !result.ok && result.text.includes("attempts"),
    "Скрытая неверная политика PrairieLearn должна отклоняться до student projection",
  );
  await Deno.writeTextFile(join(directory, "index.qmd"), privateDocument.replace('target="prairielearn"', 'target="manual"'));
  result = await command(quarto, ["render", "--profile", "student", "--fail-if-warnings"]);
  assert(!result.ok && result.text.includes("PL001_externalAssessmentMembers"), "Скрытый локальный member с manual target должен отклоняться до projection");
  await Deno.writeTextFile(
    join(directory, "index.qmd"),
    privateDocument.replaceAll("/projects/example", "/projects/missing"),
  );
  result = await command(quarto, [
    "render",
    "--profile",
    "student",
    "--fail-if-warnings",
  ]);
  assert(
    !result.ok && result.text.includes("missing"),
    "Скрытый отсутствующий проект должен отклоняться до student projection",
  );
  await Deno.writeTextFile(join(directory, "index.qmd"), privateDocument);
  result = await command(quarto, [
    "render",
    "--profile",
    "student",
    "--fail-if-warnings",
  ]);
  assert(
    result.ok,
    `Студенческое представление должно собираться:\n${result.text}`,
  );
  const student = JSON.parse(await Deno.readTextFile(modelPath()));
  assert(
    student.course.view === "student" && student.assessments.length === 0 &&
      student.exercises.length === 1 &&
      student.exercises[0].target === "manual",
    "Студенческая модель должна содержать только открытую демонстрацию",
  );
  const studentText = JSON.stringify(student) +
    await Deno.readTextFile(join(renderedRoot, "_book/student/index.html"));
  assert(
    !studentText.includes("ЗАКРЫТЫЙ-КРИТЕРИЙ-ПРОВЕРКИ") &&
      !studentText.includes("exr-experiment"),
    "Закрытые задания и критерии не должны попадать в студенческую модель или HTML",
  );
  result = await command(quarto, [
    "render",
    "--profile",
    "full",
    "--fail-if-warnings",
  ]);
  assert(result.ok, `Полное представление должно собираться:\n${result.text}`);
  const full = JSON.parse(await Deno.readTextFile(modelPath()));
  assert(
    full.course.view === "full" && full.assessments.length === 1 &&
      full.exercises.length === 4,
    "Полное представление должно содержать три контрольных задания и открытую демонстрацию",
  );
  const question = full.exercises.find((e: { id: string }) =>
    e.id === "exr-experiment"
  );
  assert(
    !JSON.stringify(question.body).includes("ЗАКРЫТЫЙ-КРИТЕРИЙ-ПРОВЕРКИ") &&
      JSON.stringify(question.gradingNotes).includes(
        "ЗАКРЫТЫЙ-КРИТЕРИЙ-ПРОВЕРКИ",
      ),
    "Условие и критерии должны оставаться раздельными для последующего экспорта",
  );
  assert(
    !("prairielearn" in
      full.exercises.find((e: { id: string }) => e.id === "exr-public-demo")
        .extensions),
    "Демонстрация с ручной проверкой не должна получать данные адаптера PrairieLearn",
  );
  result = await command(quarto, [
    "render",
    "--profile",
    "student",
    "--fail-if-warnings",
  ]);
  assert(
    result.ok &&
      (await Deno.stat(join(directory, "_book/full/index.html"))).isFile,
    "Student повторный render должен сохранять full выход",
  );
  assert(
    JSON.parse(await Deno.readTextFile(modelPath())).course.view === "student",
    "Текущая модель смешала views",
  );
  console.log(
    "ПРОЙДЕНО представления full/student, отделение закрытых заметок и исключение демонстрации из PrairieLearn",
  );

  // Обычное занятие ядра может включать ручную проверку. Общая метка
  // допустима для основной контрольной и пересдачи.
  const plain = structuredClone(withoutPolicy);
  plain.exercises[0].target = "manual";
  plain.exercises[0].authoredTarget = "manual";
  plain.exercises[0].extensions = {};
  const retake = structuredClone(valid);
  retake.assessments.push({
    ...structuredClone(retake.assessments[0]),
    id: "sec-retake",
  });
  for (
    const [name, model] of [["обычное занятие ядра", plain], [
      "общая метка для пересдачи",
      retake,
    ]]
  ) {
    await Deno.writeTextFile(
      join(directory, "candidate.json"),
      JSON.stringify(model),
    );
    result = await command(cue, [
      "vet",
      join(core, "spec/core.cue"),
      join(adapter, "spec/prairielearn.cue"),
      "candidate.json",
      "-d",
      "#Course",
      "-c",
    ]);
    assert(result.ok, `${name} должно проходить проверку:\n${result.text}`);
    console.log(`ПРОЙДЕНО ${name}`);
  }
  await Deno.writeTextFile(
    join(directory, "_quarto.yml"),
    config.replace("adapters: [prairielearn]", "adapters: []"),
  );
  await Deno.writeTextFile(
    join(directory, "index.qmd"),
    document().replaceAll('target="prairielearn"', 'target="manual"'),
  );
  result = await command(quarto, ["render", "--fail-if-warnings"]);
  assert(
    result.ok,
    "Установленный неактивный адаптер должен допускать обычный курс: " +
      result.text,
  );
  const inactive = JSON.parse(await Deno.readTextFile(modelPath()));
  assert(
    JSON.stringify(inactive.registeredTargets) === '["manual"]',
    "PrairieLearn target подключился только из установки",
  );
  const example = join(directory, "example");
  await copy(join(root, "examples/course"), example);
  for (const repository of [coreRepository, root]) {
    result = await command(quarto, ["add", repository, "--no-prompt"], example);
    assert(
      result.ok,
      `Установка расширения в пример завершилась ошибкой:\n${result.text}`,
    );
  }
  for (const view of ["student", "full"]) {
    result = await command(quarto, [
      "render",
      "--profile",
      view,
      "--fail-if-warnings",
    ], example);
    assert(
      result.ok,
      `Пример в представлении ${view} должен собираться:\n${result.text}`,
    );
    const model = JSON.parse(
      await Deno.readTextFile(
        join(renderedRoot, "_generated/course-spec/course.json"),
      ),
    );
    assert(
      model.exercises.length === (view === "student" ? 2 : 5),
      `Неверный состав заданий примера в представлении ${view}`,
    );
    assert(
      model.assessments.length === (view === "student" ? 1 : 2),
      `Неверный состав занятий примера в представлении ${view}`,
    );
    if (view === "full") {
      const control = model.assessments.find((a: { id: string }) =>
        a.id === "sec-essay-ranges"
      );
      assert(
        control && control.extensions.prairielearn.attempts === 3 &&
          control.extensions.prairielearn.pass["at-least"] === 2,
        "Авторская тема не должна менять ID или правила контрольной",
      );
    }
  }
  await selectedDocument(example, "labs/01.qmd", "full");
  result = await command(quarto, [
    "render",
    "--profile",
    "student",
    "--fail-if-warnings",
  ], example);
  assert(
    result.ok,
    "Полная native сборка после selected должна пройти: " + result.text,
  );
  console.log("ПРОЙДЕНО сборка примера в представлениях student и full");
} finally {
  await Deno.remove(directory, { recursive: true });
}
