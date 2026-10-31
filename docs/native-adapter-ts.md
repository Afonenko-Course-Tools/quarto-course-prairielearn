# Исполняемый контракт адаптера

Текущая реализация описана в [native TS](native-ts.md). Единственный owner canon
формы и нормализации находится в `application/native-business.ts`,
`declarations.ts`, `submission.ts`, `native-checks.ts` и `native-materialization.ts`.
Публичный API экспортирует эти runtime schemas/decoders и consumer factories.
Static DTO types не заменяют runtime validation и живые Core guards.

Частичный publication vet допускает отсутствие необязательных topic/submission;
полная delivery требует их. Unknown fields, явные null/false вместо карт,
неправильные enum/paths/numeric policies и конфликт grading отклоняются.
Assignment заменяется целиком при локальном override, другие карты сохраняют
принятую композицию, native numeric metadata нормализуется у владельца C.
Отсутствующие ceilings/repeat controls не получают выдуманные defaults.

Typed validator запрашивает четыре metadata planes. Core остаётся владельцем
preprojection source facts, actual format/profile identity и currentness. C не
имеет второго reader/AST collector или fallback-модели. Полная composition
проверяет actual prepared correlation и полный owner source coverage; pure DTO
validation не даёт business/cache/publication authority.

В `tests/owner-contract.test.ts` сохранены проверки нормализации и отказов,
`native-scope-integration.ts` проверяет настоящий installed producer/consumer,
correlation mutants и reuse. `native-answers-integration.ts` сохраняет все пять
форм и public/private границы. `native-a1-reuse-integration.ts` проверяет реальные
plans/inventories, shared origins и citations. Прежние model-only fixtures не
являются целевым runtime API; их существенные гарантии перенесены в эти проверки.
