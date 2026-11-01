# Native auxiliary children и отложенная публикация

Внутри проверенной native composition C сохраняет полную карту окружения один раз. Body, Python и каждый C Git child получают её с `clearEnv:true`; до spawn и после завершения child выполняются live fence и сравнение parent env. Для Git прежнее исключение `GIT_*` применяется к сохранённой карте, затем добавляются фиксированные config overrides. `nativeBody` не даёт полномочий и не включает runtime-квалификацию. Обычный Body без внутреннего auxiliary context сохраняет прежнее поведение.

Python исполняет прежний inline script с `-I -S -B`. Pinned `trusted-git/build_git_materials.py` не изменён. Поддержаны два существующих recipe результата: корневой A и линейные S0→S1. C сравнивает возвращённые refs/head/status и identity с настоящим Git main, точным графом родителей, чистыми index/worktree, fsck и полным object closure. Declared starter bytes сохраняются. Ни SHA-подобный JSON, ни переименование S1 в A сами по себе не проходят проверку.

Authored `include-git` обрабатывается также для upload: именно так SP github-ssh сохраняет два исходных коммита. Это не изменение его режима на Workspace. Restore остаётся Workspace с одним начальным commit. Generic seed transport больше не требует специфичный для restore `notes.txt`; настоящая recipe и materialized inventory определяют файлы.

Оба builder готовят stages с `deferPublish:true`. Native composition немедленно сохраняет prepared handle, завершает live/A1 fences и возвращает прежний publisher с проверкой только независимых C JSON bindings. Native entry сохраняет handle внутри Core callback; parent Core await успешно завершается до publish. Closing failure удаляет stages. После callback publisher не вызывает operation, resolver или A1 guards. Single consumption, fresh-output checks и private-first rollback остаются обязанностью существующих builders.

Это окончательный код перед R/M/E/P, а не самостоятельная проверка prior P. До первого C import ROOT обязан выполнить принятый prelaunch на exact frozen source/environment. Между parent final fence и rename действует frozen/exclusive-writer предпосылка; C bindings не заменяют её.

Каждый реально повторно читаемый или исполняемый auxiliary input обязателен в existing K.files/directories/absent, даже если он уже входит в S. Для пересечения S∩K admission использует прежние S hash/signature; второй whole-owner walk/hash не добавлен. Recipe, соседние data, student common-files, pinned helper и настоящий Python/Git/Quarto loader closure перечисляются до qualification. Mutable helper work/template/stage — output и в immutable K не входят. Внешние preparation inventories не являются полным K или P. Финальная адресная таблица и source-bound ограничения передаются ROOT в evidence.

Ограниченные проверки используют настоящие Python/Git/Pandoc, immutable SP recipes и existing builders с отдельным явно синтетическим Body/config/image harness. Они не подтверждают actual assignment, образ Workspace, OCI, full-course или release. Platform reader отдельной версией ещё должен принять настоящий restore seed (`core.autocrlf=false`, русское сообщение начального commit); изменение учебного seed ради reader запрещено. Workspace с S0/S1 — условный будущий случай, не authored github upload и не расширение этого выпуска.

## Явное размещение Git seed в native artifact

C-owned конфигурация `prairielearn.seed-targets` задаёт owner-relative targets
по exercise ID, например `seed-targets: {exr-example: versioning/project}`.
Это не поле Core `course-project` или `project-materialization` и не источник
полномочий. Значение приходит через тот же captured configuration slot;
изменение raw capture относительно authentic Core metadata отвергается.
Полная native validation связывает каждую запись с единственной объявленной
задачей, её `include-git: true` и режимом сдачи. Неизвестные, неоднозначные,
несогласованные между sources и не связанные с include-git записи запрещены.

При отсутствии записи остаётся `work`. Для upload допускается явный безопасный
относительный target, без вывода из README или имени упражнения. Workspace
сохраняет `work`; другой target отвергается, контракт образа и seed manifest
не расширяется. Служебные `.git`, `.pl-seed`, `.quarto`, `_generated`,
`node_modules`, выход за artifact и перекрытие корневого README запрещены.
Полный file/directory prefix conflict проверяется до упаковки. Существующие
starter bytes под выбранным target обязаны совпадать с выходом recipe;
соседние имена с похожим строковым префиксом не заменяются.

Только место упаковки меняется: recipe, A/S0/S1, commit messages, object
closure, trusted helper, currentness и manual scoring сохраняются. Проверки
с настоящими recipe и ZIP выполняются командой
`quarto run tests/native-seed-target.ts <exact SP checkout> <exact Download checkout> <own output>`.
Это bounded ordinary fixture; actual assignment, prior P и весь курс требуют
отдельной квалификации.
