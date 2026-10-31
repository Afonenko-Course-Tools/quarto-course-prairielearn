# Native TS: границы PrairieLearn

Эта ветка переносит потребителя на публичную текущую операцию Core. Кандидат 31
октября проверяется с Core `753040fd85984a4e8a0613fd5cd7ecf30f179ce3`;
независимая приёмка producer→consumer, полная course composition и выпуск
выполняются отдельно. В code phase 31 октября штатные
`entrypoints/export-course.ts` и `export.ts` входят через inert `capture.ts`. До
публичного producer gate не импортируются exporter/metrics modules и не
запускается inspect/render. CLI пока отказывают в выпуске: native positive и
завершённая композиция зависят от открытых ниже публичных границ. Это
промежуточные исходники, не установленный курс.

## Ранняя запись

После Core native pre hook вызывают `prepareNativeAdapter(Core, expectation)`.
`expectation` задаёт физический owner, projection и outputDirectory. Если
profiles не переданы, функция берёт точный ordered список из действительного
`QUARTO_PROFILE` этого native pre. Родительские аргументы рендера список не
задают. Повторная preparation той же generation проверяет сохранённый request;
прежние raw captures остаются на месте. Другая generation получает отдельный
каталог.

`native-ts/raw-capture.lua` работает до Core audience projection и независимо
читает exact target через `quarto.format.format_identifier()`. Поддержаны HTML и
revealjs. Capture связывает source, witness, generation, profiles, projection и
фактический document format.

C request сохраняет публично проверенные pending identity, source bindings и
outputDirectory. Внутренний `readNativeAdapterExpectation` читает их как CLI
correlation candidate. Затем требуется новый `Core.withCurrentNativeOperation` с
точным expectation и `createNativeAdapter({root, core, preparedIdentity})`. Сам
request полномочий на материалы не даёт. Stale/foreign identity, смена
profiles/output и отсутствующее поле отказывают до выпуска файлов.

## Исполняемая проверка

Adapter запрашивает ровно четыре `nativeMetadataReadSet` slots: `configuration`,
`assessment`, `projectChecks`, `projectMaterialization`. Обе стороны сравнения
проходят один C canon. Отдельно сохраняется различие между запрошенным
отсутствующим slot и неподдержанным producer envelope. Lone `configuration` не
используется.

`adapter.validateCourse(operation, {expectedSources, courseId})` сначала
получает все authentic callback inputs через публичный `validateRelease`, затем
проверяет grading composition всех документов. При неудаче consumable business
state очищается. Прямой `adapter.validate` сохраняет строгий отказ для неполной
cross-document composition. Закрытые canonical `declaration.answer` потребляет
только PL composition; они не добавляются к public
Body/catalog/proof/README/ZIP. Raw ответ содержит только presence marker.
Авторский YAML ответа разбирает Core.

`adapter.assignmentDelivery(operation, request, {projectPlans, references}, release)`
передаёт исходные live A1 pairs и существующий QRC context публичной операции
Core. Возвращаются точные `publicPackage` и `conditions`, без flatten/sanitize
авторского AST; rich title/introduction, publicAnswer, bibliography и resources
остаются данными producer. `nativeAnswers` и `nativeSettings` — отдельные
private входы existing builder. Обычная операция с успешным release proof не
получает assignment authority: настоящий negative control даёт
`BODY.ASSIGNMENT_REQUIRED`. Положительный assignment transport ещё не проверен.

Пять canonical форм lowered в существующий question builder: manual, numeric,
multipart, matching и single-choice. Private `server.py` выставляет конечный
результат по равным автоматическим leaves; manual части остаются вне их
знаменателя. Native формы используют стандартные
[элементы PrairieLearn](https://docs.prairielearn.com/elements/pl-string-input/)
и [server.py](https://docs.prairielearn.com/question/server/). Проверки
сгенерированных функций не заменяют исполнение полного вопроса на закреплённом
PrairieLearn.

## Проекты и публикация

`selectNativeCompilerInputs` читает проверенные A1 plans/inventories. Он
сохраняет actual targets `src/main/java`, `src/api/java`, `src/test/java` и
`author/<group>/...`. Дополнительные reference-классы разрешены в своей declared
solution group. Роли, bytes/SHA256/size, расширения, размеры, count и API subset
проверяются до построения runtime descriptor. Прежний `source-selection.ts` с
ограничением student partition остаётся частью прежнего пути.

`java-build` допускает library JAR с двумя ключами `kind` и `artifact`.
Присутствующий `main-class` проходит прежнюю строгую проверку; null/пустое
значение не означают omission. Genuine Gradle recipe, API и JUnit принадлежат
Platform.

`exportCourse` принимает явный `content` и готовые `nativeInputs`/private
`nativeAnswers` от composition. Native caller не создаёт `result.model`; прежний
collected result остаётся отдельным входом и не смешивается с `content`. Для
native operation используют `deferPublish: true`: builder возвращает `delivery`,
одноразовый `publish()` и `discard()`. Публикацию вызывают после успешного
внешнего Core final fence; при исключении подготовку удаляют.

Для Workspace `include-git` проверяется по authentic materialization policy и
исходному `seed_recipe.py`. Непустые `common-files` требуют exact binding к
проверенному student inventory: `student/` задаёт partition, оставшаяся часть —
actual A1 target. C не создаёт новый target из metadata. Source path после
native Quarto rebasing нормализуется в том же C canon относительно authentic
source; containment, declared dependency и bytes match сохраняются. Каноническая
A/main и upstream seed передаются существующим Workspace helpers. Фактический
image и возврат из запущенного Workspace квалифицируются отдельно.

Одиночный `exportPrairieLearn` поддерживает deferred порядок через
`context.deferPublish`, возвращая `publish()/discard()`.

`nativeVerificationInventory` хеширует уже выбранные source/test/reference
bytes, descriptor, provenance и contract case IDs; отдельно выдаёт scenario
hash. Он не читает legacy `sourcePath`, не добавляет API/demo в балльные
scenarios и не создаёт authority. Currentness остаётся обязанностью живой
composition. Его hashes нельзя подставлять в legacy
`checks.sourceSnapshotHash/inventoryHash`: те связывают другую canonical
проекцию sources/projects и требуют согласованного mapping или явной миграции
контракта.

## Промежуточное подключение a8fa (31 октября)

В новой изолированной ветке обе существующие CLI вызывают public assignment
`mode: "new"`. `active.json` прежнего A не читается: genuine lease descriptor B
задаёт новый request B, ordered profiles, witnesses и outputDirectory. Lease
сверяет B до capture token/child и после него. Consume-existing явно отказывает
до чтения owner и создания scope; CLI не перепривязывает A. Отсутствующий или
foreign A в inert controls не является stale-generation проверкой.

Выбор работ использует только уже прочитанные `fileInformation[source].metadata`
того же owner inspect: direct frontmatter `assessment.id` должен быть уникален.
Inherited-only/missing ID, повтор и foreign input отвергаются до child. Для 13
Java/SP labs ROOT подготовил отдельный metadata patch; C не меняет исходники
курса и не восстанавливает ID из heading/basename. Полный owner input передаётся
в capture. Новый private output `_generated/prairielearn-native-render` входит в
ещё открытую квалификацию producer argv/G/K.

`nativeProjectWitness` сохраняет public complete project facts, hidden/nonbank
объявления, actual formats, sourceRows того же S и common-files/includeGit.
Собственный `nativeProjectWitnessHash` имеет явно отдельную область и не
заменяет legacy hashes. Чистые DTO tests не создают authority.
`withNativeProjectPlans` удерживает настоящие A1 contexts всех actual formats
вложенными callbacks и создаёт student/full из одного context на проект.
`withNativeAssignments` передаёт эти exact live pairs и предоставленный QRC
context public delivery, оставляя private answers отдельно. Этот bridge с a8fa
пока только скомпилирован; assignment positive не выполнен и не заявлен.

Штатный `prepareNativeCourse` после настоящего validateRelease/public provenance
отказывает с `PL.NATIVE_CHECKS_CONTRACT_UNQUALIFIED` до A1 inquiries и builder.
Public ArtifactFile пока не передаёт точный physical source, необходимый для
прежних CheckProject source selections. ROOT предпочёл минимальное data-only
расширение существующего Core producer: подробный запрос в
[native-origin-request.md](native-origin-request.md). До matching immutable API,
parity controls и OTHER/ROOT решения strict v3 publish закрыт. Последующее
соединение materialization/QRC/Download и существующих builders, все
works/forms, standalone ZIP/privacy/citations и producer qualification остаются
открыты.

## Raw source и открытая selection-origin граница (Core163bc)

Matching public ArtifactFile теперь передаёт optional rawSource только для
неизменённой raw copy. C сохраняет это поле при native selection. Чистая
`nativeRawSourceSelection` проверяет bytes/SHA/same-S row и отдельное compiler
name, не читает rawSource и не создаёт A1 authority. Вызов такой функции на DTO
не означает genuine operation; production integration ещё не подключена.

Конкретный shared trusted API actual Java candidate лежит вне declared project,
и legacy projectRelativePath не может выразить его без запрещённого '..'.
Текущая функция явно отказывает; existing CLI G2 barrier сохранён. Совместный
C/Platform [selection-origin proposal](native-selection-origin-proposal.md)
задаёт минимальный кандидат version2 private checks/job и точные readers,
schemas, hash bindings и controls. Это предложение, не accepted implementation.
Platform authority — exact581cc17/platform-release-integration; старый38bc не
переносится в новый runtime proof. До OTHER/high+ROOT bounded ruling
Platform/contract revision не меняются. Builder work остановлена по ROOT.
