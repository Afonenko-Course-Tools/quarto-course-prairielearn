# Запрос G2: происхождение файлов существующего A1 producer

Это техническое предложение к immutable Core
a8fae4756fe48da520b15da156751647cc1e4825, а не изменение Core/Platform или
принятый контракт. ROOT предпочёл минимальный вариант A; до точного API и
independent review C сохраняет явный отказ strict v3.

## Уже существующие факты

В `artifacts/project.ts:405–435` функция `add(target, bytes, reason, source?)`
знает точный source и сохраняет его в private `provenance` Map. `:441` передаёт
`file.path` для планового файла, `:470` — фактически прочитанный path для tree.
Source уже прошёл те же context guards; bytes уже прочитаны/хешированы. Public
`ArtifactFileSchema` (`artifacts/contracts.ts`) оставляет target, bytes, size,
sha256, audience и reason; exact source в DTO отсутствует. Generated README и
rendered fragments не имеют raw-file origin, равного их bytes. C не может
получить source через target, совпадение hash, повторный walk или новый
resolver.

## A: минимальное data-only дополнение Core

Предлагается optional source-origin в существующем ArtifactFile для неизменённых
raw copies. Его значение — canonical owner-relative actual source, полученный из
уже существующего `source` argument add; абсолютный owner не публикуется. Для
generated/transformed entries поле отсутствует. Не выводить origin из названия
target и не выдавать fragment source за raw origin. Точное имя/форма поля и
schema/version migration принадлежат Core/OTHER, C их не утверждает.

Сохраняются student privacy/role guards, exact raw bytes SHA и source
currentness; существующий cached inventory/clone возвращает тот же origin. Это
не новый IO, не новая selection, не право читать source по произвольному пути.
Origin для закрытых full файлов остаётся только в private C grading transport;
public Body/README/ZIP/delivery не получают закрытые source paths.

Обязательные Core controls: raw state.files и tree paths с
rebasing/common-files; student/full roles; generated README/resource
transformations без guessed origin; schema unknown/unsafe/absolute paths;
serialized clone не получает authority; cache/clone exact origin и bytes;
changed/missing/aliased source/currentness; source privacy и одинаковые targets
при разных raw origins; counters без нового walk/hash/read. Затем C proof:
actual A1 target + raw source + selected bytes сопоставляются с public same-S
rows и CoreProjectFact; source/trusted tests/API/ verification
tests/references/contract cases/fixtures/readiness имеют точную область прежнего
CheckProject. Отсутствующее origin не восстанавливается.

Legacy hashes требуют отдельной exact parity:
`sourceSnapshotHash = SHA256(canonical({sources, projects}))`, где sources —
только прежние collected documents с SHA, projects — нормализованный полный
CheckProject[] в прежнем порядке. `inventoryHash = SHA256(canonical(projects))`.
Same-S rows сами по себе не являются этой source областью. Native fact сохраняет
source, bankMember, purpose, statementVisibility, artifactPolicy, check и
materialization. Критерий — equality exact selected case bytes/IDs/reference
optional flags и scenario records, а не equality произвольных witnesses.

## B: явная native contract revision

Если A недостаточно для прежней нормализации, потребуется новый discriminated
native checks/delivery/provenance contract с owner-relative authored source
rows, полными CoreProjectFact, actual A1 target/role/byte commitments и C
scenario inventory. Новые hash names задают свою область; старые имена не
заполняются новым whole-S/target witness. Прежний verificationInventoryHash
остаётся SHA canonical scenario records только при доказанном совпадении
starter/reference/ contract IDs и порядка. API/demo не становятся балльными
scenarios.

Эта дельта существенно шире: C `application/export-course.ts:699–706` пишет
старые delivery-v3 поля; `application/verification-inventory.ts` читает physical
contract cases. В Platform frozen 38bc source фактические consumers включают
`tools/build-course.py:168–170`, `release_assembly.py:144–169`,
`delivery_verification.py:45–50,200`, `grading_job.py:476–512,1338–1357`,
`stage_courses.py:41–56,99`; они сверяют checks/delivery/provenance/admission и
scenario inventory. Generic grading jobs/source readers дополнительно требуют
projectRelativePath/submissionRelativePath; строковое переименование hash их не
мигрирует. Нужны строгие schema rejection/downgrade controls, current source and
payload tamper, case/reference parity, release assembly/admission, finite grader
results и privacy. C и Platform в этой фазе не расширены до такого решения.

## Следующее подключение C

После immutable origin API — matching public schemas, genuine A1 byte selections
без source guesses, exact old/new check parity и OTHER whole Core+C review.
Затем отдельно допускается квалифицированный assignment producer/mainModule/
profiles/argv/G/K/prior P и actual all-work export через существующие две CLI и
builders с deferred publish/final fences. До этого нет assignment positive,
полного Java128/SP7 PASS, OCI qualification или выпуска.
