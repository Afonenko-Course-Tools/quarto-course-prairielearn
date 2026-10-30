# Ранняя публичная TS/native граница PrairieLearn

Эта ограниченная партия проверена с Core `b74699ed9216e2d3caacadcd6b39094cb1d6c795`
и Quarto 1.11.5. Она не переключает установленные расширения и не заменяет
целый экспортёр курса. Старые CUE/Lua пути сохранены до квалификации их замены.

Публичный вход — `_extensions/course-prairielearn/public.ts`.
Composition передаёт настоящий публичный модуль Core, не его private runtime
или сериализованное свидетельство. Общую metadata inheritance выполняет Quarto.
`decodeNativeBusiness` и `decodeNativeCheck` проверяют только namespace PL;
публичные runtime-схемы Core остаются у Core.

Порядок штатного запуска:

1. Core `entrypoints/native-pre.ts` начинает generation.
2. C pre вызывает `prepareNativeAdapter(Core, expectation)` через публичный
   `withPendingNativeOperation`. Запрос сохраняет operation и отдельные
   `source/captureWitness`; абсолютных private Core pointers нет.
3. `native-ts/raw-capture.lua` запускается в `pre-ast` **до Core early filter**.
   Он сохраняет PL metadata и authored attributes всех исходных `exr-*`, включая
   restricted declarations. PL business schema проверяет raw namespace до
   audience projection. Обычный старый `filter.lua` не является этим capture.
4. После native late/post composition открывает `withCurrentNativeOperation`,
   создаёт `createNativeAdapter({root, core: Core})` и вызывает
   `operation.validateRelease({expectedSources, courseId}, [adapter])`.
   Исполняемый callback сверяет generation, source, witness, format, profiles,
   projection и сохранённые authored PL attributes. Он возвращает нейтральные
   owner-relative project dependencies, которые проверяет Core.
5. Подготовленные результаты публикуются composition только после успешного
   внешнего fence Core. Запись во временный staging не является публикацией.

Все Quarto children должны получать `DENO_NO_PACKAGE_JSON=1` и
`QUARTO_RUN_NO_NETWORK=true`, а также принятые cache/JDK environment variables.
Frozen Core payload не получает новый `deno.lock` при запуске.

`adapter.business(source)` возвращает проверенный PL канон после callback.
Это данные владельца, а не новое полномочие на чтение файлов или release proof.
Неверный raw capture не заменяется default/fallback.

## Compiler inputs и корневая миграция

`selectNativeCompilerInputs` — чистый consumer действительных A1 student/full
inventories и typed plans одной операции. Он проверяет публичные схемы Core,
target bytes/SHA256, operation/exercise/audience, явные PL roots/globs и роли
`starter`, `testset:<name>`, `component:<name>`, `solution:<name>` из плана.
Имя сдаваемого файла сохраняет путь относительно явного source root;
basename не используется. API precheck остаётся собственным подмножеством
доверенных Java files. Существующий `runtimeDescriptor` сохраняет API, scoring,
limits и additional sources policy.

В D1 root требуется добавить новый ID source-profile в существующий реестр,
например `java-gradle` с `root: src/main/java`, и явно перевести на него только
два принятых check. Старый `java-main` остаётся для остальных задач. Проверенный
fixture использует явные test targets `src/api/java/**/*.java` и
`src/test/java/**/*.java`, reference roots `author/<declared-group>/src/main/java`.
Они сопоставлены с реальными reasons/bytes A1, не выведены из имён каталогов.
Отсутствующий required selector вызывает `PL.SELECTION_MIGRATION_REQUIRED`.

Эта проверка отбора сохраняет прежний Java runtime ID. Она **не квалифицирует
финальный переход D1 на javac**. Обязательный обычный Gradle build → API → JUnit
остаётся отдельным gate C3/root. Старый `gradle-jar-v1` требует `main-class` и
предназначен для executable JAR; библиотечный Book не получает вымышленный main.

## Workspace seed

Используется существующий `prairielearn.question-defaults.submission` с
`mode: workspace` и явными `workspaceOptions`. Explicit upload выбирает закрытый
upload variant без Workspace fields. Отсутствующие image/options вызывают отказ;
локальный image ID не превращается в опубликованный RepoDigest.

`adapter.workspaceArtifact({operation, expectedSources, source, exerciseId,
inventory, zip})` повторно вызывает настоящий executable release validation,
проверяет Core student inventory и его bytes/identity. Затем C выполняет
owner-relative `seed_recipe.py` при явном `include-git: true`. В этой партии
поддержан принятый пустой `common-files`; другой состав требует явного native
binding и получает отказ.

Доверенный `application/trusted-git/build_git_materials.py` содержит только восемь
общих функций принятого SP commit. `provenance.json` фиксирует source/function
SHA256; tests сравнивают точные function bodies. Учебные generate/build/CLI
не перенесены. Runtime проверяет точный SHA256 этого helper. Recipe создаёт A
в пустом staging; чистые main/index/worktree, единственный commit и полное
совпадение object database с замыканием A проверяются до упаковки. Недостижимый
готовый B также запрещён. Существующие student материалы не заменяются другими
байтами recipe. Этот путь не выполняет restart и не изменяет student workspace.

Git добавляется только в C-owned ZIP. Общий `ArtifactInventorySchema` Core
продолжает запрещать `.git`. `workspaceSeed` создаёт прежний native manifest;
Platform bootstrap и pinned upstream matcher выполняют собственные проверки.
Действия restore и наблюдения Manual не выводятся из конечного состояния.

## Открытые границы

Answer/answer-spec/correct transport требует следующего принятого public Core
контракта и сейчас получает `PL.ANSWER_UNQUALIFIED`. Cross-document assessment
grading composition пока получает `PL.ASSESSMENT_UNQUALIFIED`; локальная policy
использует прежние grading/component rules. Полный native course exporter,
все 128+7, все authoring forms, обычный/library Gradle runtime, root config
migration, installed/live qualification и OCI publication остаются открытыми.
Ни один из этих gates не закрывается успешным ранним slice.

Локальные команды проверки: `deno test --no-config -A tests/*.test.ts`,
`quarto run tests/native-adapter-integration.ts <Core snapshot>`,
`quarto run tests/native-actual-slice.ts`,
`quarto run tests/native-sp-carrier.ts <SP checkout>`,
`python3 tests/trusted-git-helper.py <SP checkout>`.
