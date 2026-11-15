# Техническая приёмка native PrairieLearn

Этот документ описывает воспроизводимые проверки технической части Core #69,
PrairieLearn #35 и Java #38. Реальный браузер, native sync и контейнерный grader
проверяет владелец отдельного стенда. Успех exporter unit tests не заменяет эти
проверки. Учебные условия и веса канонических курсов не меняются.

## Владельцы стадий

`native-course.ts` удерживает genuine Core operation, единственный batch project
contexts, checkpoint и staged-output handle. `native-course-stages.ts` строит
одну карту уже проверенных source policies, authored compatibility projection и
нужные menu bodies. `native-course-questions.ts` проверяет повторные questions,
answers и response slots, затем материализует каждый project один раз.
`native-standalone.ts` владеет private scratch directory и binding parity; его
`finally` удаляет только этот scratch. Публикация остаётся после закрывающего
Core fence; прежние no-replace, discard и retry contracts сохраняются.

Grading разделяет assessment-level admission, scalar/array points и component
points. У Workspace проверка исходного inventory отделена от проверки точной
Git history; Python и каждый Git child используют прежний saved environment и
pre/post currentness guards. Существующие дробные authored points допустимы;
данная декомпозиция не вводит решения Java #37 об изменении весов или истории.

## Настоящая нумерованная книга

Из корня exporter:

```sh
mkdir -p /tmp/pl-title-cache
XDG_CACHE_HOME=/tmp/pl-title-cache quarto run tests/native-readable-titles-public-cli.ts \
  ../quarto-course ../quarto-reference-catalog ../quarto-project-download /tmp/pl-imports.json
```

Карту создаёт `quarto run tools/native-core-import-map.ts ../quarto-course
/tmp/pl-imports.json ../quarto-reference-catalog ../quarto-project-download`.
Тест независимо сверяет `infoAssessment.json.title`, `info.json.title` и видимый
`question.html`: Link, Code, Unicode и авторские числа сохраняются; AST attrs и
служебные numbering spans не превращаются в видимый текст. Всё проходит штатный
public CLI; фикстура удаляет только собственный временный каталог.

## Editor, локальная IDE и совместимая смена формы

`tests/native-editor-acceptance-fixture.ts` создаёт новый synthetic source book,
копирует публичные расширения, сохраняет отдельный снимок runtime registry и
вызывает обычный `export-course.ts`. Нужен новый `TARGET` для каждого запуска.
Генератор не синхронизирует DB, не редактирует текущую native Git ветку и не
подменяет renderer. Runtime registry берётся от принятого выпуска стенда.

```sh
XDG_CACHE_HOME=/tmp/pl-editor-cache quarto run tests/native-editor-acceptance-fixture.ts \
  /tmp/pl-editor-v1 editor ../quarto-course ../quarto-reference-catalog \
  ../quarto-project-download /path/to/runtime-profiles.json /tmp/pl-imports.json
XDG_CACHE_HOME=/tmp/pl-editor-cache quarto run tests/native-editor-acceptance-fixture.ts \
  /tmp/pl-editor-v2 upload ../quarto-course ../quarto-reference-catalog \
  ../quarto-project-download /path/to/runtime-profiles.json /tmp/pl-imports.json
```

Оба выпуска имеют `course.id=pl-editor-closure`, работу `sec-editor`, вопрос
`exr-editor` и instance `fixture`. В первой версии выбраны `demo/Add.java` и
`demo/Helper.java`: ровно два editor. Во второй добавлен необязательный для
решения `demo/Marker.java`: ровно один ZIP upload. `primary-required: false`
сохраняет допустимость полного решения из прежних двух файлов. Имена первых
файлов, API, тесты, maximum 10, question/assessment/course UUID остаются прежними.

Порядок фактической приёмки на отдельной DB/native Git ветке:

1. Импортировать `/tmp/pl-editor-v1/native`, записать course/assessment/question,
   assessment-instance, variant и student IDs. Открыть работу как тестовый студент.
   В browser убедиться в двух editor и единой ссылке starter ZIP.
2. Оставить исходный `Helper` с `return 0`, сохранить незавершённый ответ штатной
   кнопкой и войти заново. Проверить точные bytes. Отправить; два assertion должны
   не пройти, новая сдача должна остаться в истории.
3. Скопировать файлы `/tmp/pl-editor-v1/answers/error`: ошибка compilation
   `missingSymbol` отличается от assertion и не теряет stage/diagnostic.
4. Скопировать `answers/correct` в оба editor. Оба теста проходят, maximum 10;
   вопрос не создаёт третьего способа ответа. Сохранить IDs и историю всех трёх
   ответов, включая возвращённые native файлы.
5. Скачать настоящий `starter.zip`, распаковать в новый каталог локальной IDE,
   заменить исходники из `answers/correct`, собрать `javac -d classes
src/main/java/demo/*.java`. Проверить вызовы `demo.Add.sum(2,3)==5` и
   `demo.Add.sum(Integer.MAX_VALUE,1)==2147483648L`. Исходники в ZIP имеют пути
   `src/main/java/demo/Add.java` и `src/main/java/demo/Helper.java`;
   сдаваемый solution ZIP содержит logical paths `demo/Add.java` и
   `demo/Helper.java` относительно source root. Содержимое ZIP надо проверять фактически; starter README и открытые ресурсы сохраняются.
6. Опубликовать второй готовый native выпуск обычным Git sync без повторного
   render. Зафиксировать успешный sync и прежние UUID/native IDs. Войти снова:
   прежние variant/submissions/два файла доступны в истории с точными bytes;
   новая форма имеет один ZIP control. Отправить из IDE ZIP с двумя прежними
   `demo/*.java`, затем вариант с третьим `demo/Marker.java`: оба проходят.
   Перепроверить прежние результаты и отсутствие дублированных новых instances.

Выше перечислены критерии, а не заявление об уже выполненной UI-приёмке.
Каждый фактический результат стенд записывает с IDs, native revision, образом
runtime, input bytes и результатом grader. После любой кодовой ошибки экспорт
повторяют в новом target; неподтверждённые критерии остаются открытыми.

## Техническое дублирование starter

При настоящем `studentArtifact` exporter выдаёт единую ссылку `starter.zip`
(и README, если он есть). Он больше не добавляет рядом individual
`pl-file-download` и вторые копии выбранных sources в корень
`clientFilesQuestion`. Проекция `starter/` остаётся для README/публичных файлов.
Legacy standalone без supplied artifact сохраняет individual downloads.
Проверка `starter bundle removes duplicate downloads while legacy standalone
keeps selected source downloads` проверяет оба пути и bytes.

Exporter не добавляет текст к авторскому условию и не удаляет авторские инструкции.
README и учебные boilerplate вставки принадлежат их фактическим producer/input;
смешанная Java #38 целиком этим техническим исправлением не закрывается.

## Дополнительный opt-in без изменения весов курсов

По согласованному договору Platform добавлена необязательная
`prairielearn.delivery.course.options.integerManualPoints`. Она выключена по
умолчанию. Проверка максимумов и native schema overlay описаны в
[авторском контракте](authoring.md#явная-целочисленная-ручная-оценка-native-курса).
Положительный exporter contract проверяет записанное поле; отрицательный — отказ
при дробном максимуме до публикации. Старые дробные веса без opt-in сохраняются.
Серверную запись, диапазон, повторное открытие и passback проверяет Platform/Local.
Это самостоятельная техническая возможность; включение для канонического курса
требует отдельного принятого решения о весах.
