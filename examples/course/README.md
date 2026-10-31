# Пример авторства PrairieLearn

Текущие кандидаты — Exporter 9.0.0 и bundle Core 9.0.0 (**unreleased**).
Публичные native TS API Core 9, Body v2 и delivery v3 сохраняют отдельные версии.
Проверяемый toolchain — Quarto 1.11.5; новые теги устанавливаются
только после публикации. Для разработки используйте целые локальные checkout.
[План владельца](../../docs/plans/2026-10-08-implementation.md) фиксирует runtime
проверки; [текущий контракт](../../docs/authoring.md) описывает банк и платформенную привязку.

Из этого каталога установите локальные checkout и выполните native маршруты:

```sh
quarto add ../../../quarto-course
quarto add ../..
quarto run render.ts student
quarto run render.ts full
```

Пути hooks соответствуют локальной установке. При GitHub установке используйте
пространство владельца во всех путях. После изменения исходников повторяйте
`quarto add`. В Git остаются авторские исходники; `_extensions` и outputs
этой демонстрации исключены.

`tasks/_metadata.yml` включает банк открытых учебных задач, `controls/_metadata.yml`
— restricted условий. У каждой задачи собственные difficulty/time. Работа
и лабораторная назначают местные canonical IDs; открытый разбор с решением
используется в `.assessment-preview` контроля, вне состава. Student оставляет
название работы и описание, без restricted условий/назначений. Full показывает
полные условия; outputs разделены между `_book/student` и `_book/full`.

`render.ts` вызывает native Quarto, проверяет код завершения и текущую полную
модель. Частичный preview не подтверждает полный состав и суммы. Java во время
этого render не выполняется. [Java/Gradle группа](../java-gradle/README.md)
создаёт native delivery и выполняет настоящие локальные проверки программы;
server import/image/assignment проверяются отдельно в PrairieLearn.
[Диагностика](../../docs/diagnostics.md).

Native export требует отдельно квалифицированного source/runtime состава и prior P.
Обычная HTML-сборка и локальный Gradle test не заменяют эту проверку.
