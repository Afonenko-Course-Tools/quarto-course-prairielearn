# G2: явное происхождение native selections в C/Platform

Предложение для OTHER/high и ROOT; версии/Platform пока не изменены. Exact
inputs: C base44273a556642b58cdbc649be877ee7d69c976968;
Core163bc8abe099d98bb9e40574dd0d9c3f4a13783a/tree7c065e8d1cd5221674cf2858a00ea294600c3471;
Java399a80420878851424b3ecc720b5ac3e88afc2b5;
Platform581cc17fc22dc974c8a300c14f5d12fb7c0b3621/tree1dba50b9437e7653f18682745219960f16dcb24b.
Историческое упоминание38bc в предыдущем frozen origin request не является
runtime authority. Его не переписываем; текущая binding — только exact581.

## Конкретный отказ прежнего договора

Java `tasks/bank/numbers.qmd:249` объявляет exr-numbers-quadratic-roots с
project=/projects/numbers/quadratic-roots. В metadata этого проекта component
apiSupport ссылается на ../../common/java/api-support; verification testset api
включает его через requires. Исходный файл существует по адресу
projects/common/java/api-support/src/api/java/org/prairielearn/api/PlatformApiPrecheck.java.
По exact Core plan.ts tree-prefix правилам A1 выдаёт target
src/api/java/org/prairielearn/api/PlatformApiPrecheck.java и actual rawSource
этого общего файла. Это source-structural вывод из реальных metadata и Core
producer code; actual A1 materialization в этой фазе не выполнялась. Это data
origin, не полномочие чтения. Относительно declared project получается
../../common/java/api-support/...

C readSelected/safePath и Platform tools/grading_job.py:44–59 запрещают '..'.
Platform _selection:194–209 всегда читает relative project root. Поэтому v1 не
может выразить этот shared trusted API. Подмена projectRoot/target, копия в
выдуманном owning source, новый walk/resolver или отключение guard неприемлемы.
Bounded structural repro воспроизводит отказ exact581 safe; он не является
actual A1/assignment producer qualification. DTO tests тоже не создают
authority.

## Минимальная версия private checks

Кандидат: CheckManifest schemaVersion2 только для явного native branch. Legacy
manifest1/selection guards остаются буквально прежними. В v2 selection имеет
ровно один origin: `projectRelativePath` XOR `ownerRelativePath`, плюс прежние
submissionRelativePath и sha256. Оба пути canonical relative, без '..',
absolute/backslash/empty/dot/symlink; произвольных roots/URI нет.
Project-вариант хранит actual rawSource relative declared project; owner-вариант
— сам actual owner-relative rawSource. Submission name задаётся actual A1 target
и явной policy root, независимо от physical path. Нового selector/resolver нет.

Origin принимается только из непосредственно возвращённого guarded live A1
inventory, из одной operation, actual plan role/format/profiles, с exact same-S
row/SHA/bytes и currentness fences. DTO/schema/rawSource строка не даёт source
authority; неизвестный/отсутствующий origin у selected raw input — отказ,
generated/transformed entries без origin не могут стать compiler input. Shared
scope не сужает fullowner hidden/nonPL/nonbank privacy closure.

ROOT подтвердил сохранение HASH-ОБЛАСТИ, не равенство разных редакций политики:
sourceSnapshotHash=SHAcanonical({sources,projects}),
inventoryHash=SHAcanonical(projects). Sources — ровно captured document
source/SHA область прежнего checks, не все S rows; projects — нормализованные
checked projects в прежнем порядке. Native policy выбирает actual targets,
rawSource сохраняет физическое происхождение. CheckProfile.root не подменяется
physical root для прохода legacy guard. Версия2 и origin union участвуют в явном
private checks договоре; любые hash добавления вне этих областей должны быть
отдельно названы, а не скрыты alias.

## Точные consumers и минимальные изменения после решения

| Граница exact581/C                                                            | Предложенная дельта                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C native selector / checks projection                                         | Сохранить rawSource; actual targets/roles/bytes → selection union. API — proper subset trusted; references включают helper files; fixtures/cases/readiness используют только аутентичные выбранные bytes. Legacy source-selection.ts guard не менять.                                                                                        |
| C verification-inventory.ts                                                   | Starter/reference/contract ID records и optional flags; exact codepoint scenario order как581/Python. Чтение contract cases из уже выбранных bytes. Не читать сериализованный arbitrary source path.                                                                                                                                         |
| C export-course.ts                                                            | Deferred builders получают authentic selections; manifest2 private. Public sources пока только project-вариант, иначе явный refusal до delivery3.                                                                                                                                                                                            |
| Platform grading_job.py inventory:100–117                                     | Раздельный dispatcher manifest1/2, закрытая schema2; не permissive acceptance любого unknown version.                                                                                                                                                                                                                                        |
| grading_job.py _selection:194–209 / prepare_job:215–244                       | Один origin reader с canonical book owner + declared project, XOR branch, safe guards и exact bytes/hash; owner root берётся из уже проверенного snapshot/bookRoot, не caller arbitrary root.                                                                                                                                                |
| grading_job.py scenario_inventory:130–190                                     | Тот же reader для contractCasesHash. Сам набор scenario IDs/optional flags и order не меняется.                                                                                                                                                                                                                                              |
| grading_job.py:309,319,346,565,581                                            | Все reference, contract fixture, ZIP и staging reads переходят через тот же versioned reader. Нельзя оставить прямой safe(project, projectRelativePath) на одном ответвлении.                                                                                                                                                                |
| grading_job.py:472–486 / grading-job.schema.json                              | Job schema2 содержит native origin union; legacy job1 unchanged. sourceHashes/testsHashes keys должны различать project:path и owner:path, исключая коллизии. При reference scenario hashes описывают выбранный reference, а не starter.                                                                                                     |
| run_job:739–762 / check-result.schema.json / verification-receipt.schema.json | Эти maps сейчас opaque hash bindings и копируются без source reads. Можно сохранить receipt schemas только если review подтвердит отсутствие path interpretation и exact equality native job2 qualified keys во всех aggregation/review consumers; иначе минимальная явная receipt revision. Это OPEN ruling, не молчаливая смена semantics. |
| delivery_verification.py:67–74,187 / build-course.py:168–170                  | Public sources project-scoped с прежней формой и equality с checks.sources; private trusted owner origins сами по себе не требуют delivery4. При owner-origin в student sources — delivery3 refusal; явная public contract revision только с конкретным примером/OTHER ruling.                                                               |
| release_assembly.py:144–169 / stage_courses.py:41–56,99                       | Сохраняют согласованность source/delivery/inventory/provenance/admission; native checks version должна проверяться, неизвестные версии закрыты. Private-origin union не добавляется в public source identity/URLs.                                                                                                                           |

`sourceHashes/testsHashes` сегодня собираются по projectRelativePath и теряют
origin distinction при простом добавлении ownerRelativePath. Новый job2 key
должен быть однозначно versioned (например project:... / owner:...), не guessed
path и не файловый root. Generated archive marker $generated остаётся отдельным
явным kind; contract generated/submitted payloads не подделывают raw origin.
Exact key encoding и receipt ruling нужны до реализации Platform.

## Public delivery3 и предел доказательства

У конкретного quadratic-roots starter raw source находится внутри declared
project (starter/src/main/java); shared API — trusted private input. Это даёт
проверяемый кандидат сохранить public delivery3 для него. Полная проверка всех
student selections ещё не выполнена, отсутствие внешних starter origins для
всего Java/SP не заявлено. Если встретится external student origin, current
classification:71 требует ровно projectRelativePath/submissionRelativePath/sha;
это точная необходимость отдельной delivery/source-binding версии, не повод
обходить equality check. Common-files/Workspace не превращаются автоматически в
compiler sources и сохраняют прежние policy/privacy guards.

Private-stage сравнение: существующий snapshot/bookRoot уже задаёт canonical
owner, поэтому достаточно versioned origin reader в этом контракте. Новый
pipeline копирования общих файлов/изменения projectRoot не нужен и не предложен.

## Обязательные controls до принятия

Legacy1 regression без послаблений; project2/owner2 genuine byte selections и
одинаковые relative path strings с разным origin; XOR both/neither/unknown keys;
unknown versions; absolute/'..'/backslash/aliases/symlinks/foreign owner;
missing rawSource/S row/stale generation/changed SHA/bytes/currentness; closed
API и proper subset, component/testset roles, external starter refusal
delivery3; large lawful helper references без ограничения именами starter;
optional missing reference, source/extra-source overlaps и reserved collisions;
contract cases, fixture byte/ID/readiness и scenario order;
sourceHashes/testsHashes exact origin-qualified equality;
stage/release/admission/provenance tamper; public Body/README/ZIP/delivery без
closed origin paths/solutions; finite Gradle/JAR/API/ JUnit reports по отдельно
квалифицированному runtime. Counter budgets должны показывать
inspect/walk/hash/render/bytes/time, без повторного resolver/IO на поле.

На этой фазе реализованы только rawSource data propagation, чистая v1 projection
с явным outside-project отказом и прежняя hash-область/value controls. Новый
manifest2/job2/Platform/receipts не реализованы. Strict v3 остаётся закрыт.
OTHER/high + ROOT bounded ruling, затем SAME C implementation и whole Core+C
review; actual assignment positive требует отдельного R/M/E/G/priorP/argv/K
допуска. G3 owner inspect ROOT подтверждён отдельно (128 Java/7 SP inputs, 97+5
active IDs); это не C assignment currentness/profile authority.
