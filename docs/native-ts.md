# Native TS: текущие границы PrairieLearn 9

Core владеет Quarto reader, metadata inheritance, ранней нормализацией AST,
поздними native facts, source snapshot и живыми operation/context/plan handles.
C владеет исполняемыми TS business contracts и построением PrairieLearn delivery.
`contract.json` содержит только installed owner name `prairielearn`.
`filter.lua` — технический пустой shim регистрации Quarto extension; предметной
модели, обходов AST и дочерних процессов в нём нет.

## Capture и полная composition

`nativeEntry` начинает новый intent через публичный inert Core capture gate.
До него нет exporter/metrics imports или запуска native child. Genuine prepared
lease даёт operation identity, actual profiles и source/witness bindings;
`prepareNativeAdapter` сохраняет только correlation request. DTO не даёт lease.
Executable/argv/cwd/env/token render принадлежат Core и квалифицированной policy.
Прежняя generation не переименовывается в новую; consume-existing явно отказан.

Внутри `Core.withCurrentNativeOperation` полный `createNativeAdapter` получает
immutable `NativeAdapterValidationInput` от `validateRelease`. Ровно четыре slots
`configuration`, `assessment`, `projectChecks`, `projectMaterialization` обязательны
в readSet. Отсутствующее значение запрошенного slot отличается от отсутствующего
producer/envelope. C не обходит AST повторно и не пишет business sidecars.
Полная composition сверяет generation/source/witness/profiles/prepared identity,
expectedSources coverage, private metadata, принадлежность members платформе и
совместимость grading всех документов. Failure очищает consumable state.

Direct `adapter.validate(dto)` — чистая проверка данных без source IO; она не
пишет business/cache и не создаёт Core proof или publish authority. Schema-valid
копия DTO не обязана падать по форме, но не может использоваться вместо живой
операции. Private proof переиспользуется только для той же operation object,
identity и exact request, с currentness fence перед каждым artifact boundary.
Другой generation/request и failed currentness не наследуют cache; getters
сами не читают дерево, не хешируют файлы и не запускают inspect.

## Частичная publication validation

`inspectPublication(Core, operation, {expectedSources})` проверяет genuine
ordinary callback inputs и cross-document membership через тот же TS canon.
Частичная политика не выдумывает отсутствующий topic/submission. Полная delivery
по-прежнему требует обязательные поля, pricing и корректный grading. Результат
инспекции — данные автора, не assignment/A1 authority. `inspect-grading.ts`
читает уже завершённый текущий capture и не запускает второй inspect/render.

## Выдача, ответы и provenance

Assignment delivery передаёт существующие живые A1 student/full pairs и QRC
reference context публичному Core API. Rich title/introduction, условия,
publicAnswer, bibliography и resources берутся из producer. Пять canonical форм
ответа сохраняют private keys отдельно от public Body/catalog/README/ZIP.
Обычная операция с release proof не становится assignment operation.

`ArtifactFile.rawSource` — только canonical owner-relative origin настоящих raw
bytes; generated/transformed материалы его не получают. Сравнение с authentic
same-S rows и реальными planned role/targets обязательно. Чтения исходника по
serialized rawSource нет. Checks hash domains сохраняются: sourceSnapshotHash
хеширует canonical `{sources,projects}`, inventoryHash — canonical projects;
whole owner S не подставляется под этими именами. Verification/scenario inventory
владеет C; data DTO не заменяет текущую live selection.

Git seed добавляется только в C-owned artifact по явно объявленному безопасному
seed-target. Default work и Workspace work сохраняются, upload допускает явный
versioning/project. Python -I -S -B и Git используют frozen auxiliary environment
с pre/post currentness; grading/live restore не выводятся из конечного состояния.
Private-first staging публикуется только после завершения outer Core callback и
A1 cleanup. Ошибки удаляют staged partial output.

## Проверки и выпуск

`quarto run tests/check.ts <точный Core>` запускает canonical TS owner tests и
настоящую installed ordinary композицию. Дополнительно проверяются все формы
ответа (`native-answers-integration.ts`), A1 selection/citations/private boundaries
(`native-a1-reuse-integration.ts`), raw origin/hash scopes и реальные Git recipes.
Локальные fixtures не создают prior P, не доказывают полный активный курс или OCI
readiness. Перед выпуском требуются OTHER review и paired CI точных commits;
actual assignment/full135 и deployment имеют отдельные gates.
