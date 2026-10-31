# Точечная дельта публичной доставки: предложение для OTHER

Статус: PROPOSED, readers не реализованы, публикация закрыта. Основание: Core163bc8abe099d98bb9e40574dd0d9c3f4a13783a, C base7b8c1c55, Platform runtime authority581cc17fc22dc974c8a300c14f5d12fb7c0b3621. Dirty ci-budget38bc не является runtime authority. Отдельный ROOT API/JAR patch0e17b899 и Java common174ae5c0 — будущие интеграционные зависимости, в этой ветке отсутствуют.

## Наблюдаемые несовместимости

`application/export-course.ts` для canonical nativeAnswers создаёт `{uuid,grading,answerType}`; Platform `tools/delivery_verification.py:classification` требует `{uuid,grading,submission,sourceRoot}` и для automatic ещё `{projectCheck,runtime,sources}`. Подставить code project для numeric/single-choice/multipart/matching/manual было бы ложным контрактом. `application/export.ts` уже создаёт реальные `info.json gradingMethod=Internal/Manual`, `question.html`, `server.py`; private key остаётся в server.py, не в body/README/student ZIP.

Workspace уже создаёт `info.json gradingMethod=Manual`, `singleVariant=true`, `workspaceOptions`, `workspace/.pl-seed/starter.zip`, `workspace/.pl-seed/manifest.json`. `classification` допускает только editor/upload и требует upload для Manual; `package_integrity` знает upload/editor controls, не Workspace. Это конкретный SP Git carrier случай; shared trusted API к этому не относится. Native2 project sources остаются project-scoped: public binding имеет ровно projectRelativePath/submissionRelativePath/sha256; owner-relative student origin отклоняется явно.

## Закрытое объединение delivery4

Предлагается сохранить все общие поля delivery3, поднять только public delivery schemaVersion до4 и заменить gradingPayloads values закрытым discriminated union. Не добавлять optional code поля. Все перечисленные поля обязательны, неизвестные поля запрещены; uuid/method/source path/hash проверки прежние.

```ts
type Payload4 =
 | ({kind:"project"} & ProjectPayload3)
 | {kind:"native-answer"; uuid:string;
    grading:{method:"external"|"mixed"|"manual"};
    answerType:"numeric"|"single-choice"|"multipart"|"matching"|"manual";
    responseSlots:PublicResponseSlot[];
    upstreamGradingMethod:"Internal"|"Manual"}
 | {kind:"workspace"; uuid:string; grading:{method:"manual"};
    sourceRoot:string;
    submission:{mode:"workspace";workspaceOptions:ExistingWorkspaceOptions};
    seed:{schema:"pl-git-workspace-seed-v1";
      archive:"workspace/.pl-seed/starter.zip";archiveSha256:string;
      manifest:"workspace/.pl-seed/manifest.json";manifestSha256:string};
    upstreamGradingMethod:"Manual";singleVariant:true};
```

`ProjectPayload3` — буквальная прежняя closed method-specific форма: Manual имеет uuid/grading/submission/sourceRoot; External/Mixed дополнительно projectCheck/runtime/sources. Никакого отсутствующего/выдуманного sourceRoot/runtime для native-answer. `PublicResponseSlot` — точная Core163 NativeResponseSlot: name/type/anchor, optional labelAnchor/ordinal/options(anchor,ordinal); не numeric key/tolerance/correct index/pairs/manual rubric. Slots берутся из genuine selected delivery.conditions[id].responseSlots; type и grading сверяются с private canonical declaration.answer и C policy того же operation. `ExistingWorkspaceOptions` — точная текущая submission.ts схема image@sha256/home/port/gradedFiles и optional rewriteUrl/enableNetworking; sourceRoot остаётся фактическим owner-relative project, не переносится в target.

Native-answer ручная часть не получает fictitious JUnit/API/Job. Existing server.py lowering не меняет веса/политику: Internal/Manual проверяются по info.json, actual controls — по responseSlots; multipart mixed сохраняет authored assessment auto/manual points. Package integrity связывает server.py/question.html/info.json и безопасные ресурсы через delivery.files; closed answer никогда не помещается в public binding. Критическая privacy проверка — bytes реально отдаваемых clientFiles/README/ZIP против private key, а не только отсутствие слова key в DTO.

Workspace seed manifest обязан соответствовать archive SHA и точному ZIP file inventory; он уже объявляет work/.git/{HEAD,index,config,objects/**}, work/README.md, work/notes.txt. Прежний workspace-seed.ts проверяет обязательные элементы, возвращаемые gradedFiles включают work/**, work/.git/**, work/.*, explanation.m[d], .pl-seed/identity.jso[n]. Нужны отдельные readers bounded ZIP/git: никаких исполнений seed из receipt, arbitrary roots, symlinks, повторных/../absolute/alias entries. Include-git и непустые common-files доказывает genuine Core/C validator и same-S bindings; image/RepoDigest не выдумываются.

## Точные consumer дельты

C `export-course.ts`: dispatch по kind; generic builder `export.ts` остаётся lowering владельцем; `native-course.ts` передаёт same-operation private answers/settings/body/conditions/Artifacts. Сейчас native course для nativeanswer/Workspace явно отказывает `PL.NATIVE_DELIVERY_REVISION_REQUIRED`; standalone builder поддерживает имеющиеся формы без утверждения delivery4.

Platform `delivery_verification.py`: classification4, controls4 и package_integrity4, отдельные проверки Internal/manual native answer и Workspace files/seed; classification3 и package_integrity3 без ослабления. `grading_job.py`: delivery4 project automatic subset идёт в прежние Jobs2; native-answer Internal proof — отдельная closed ветка автоматического verification, не code job; Workspace Manual не запускает runtime. `check-course.py` должен отличать project auto IDs от Internal native answer IDs, не называть Manual всё, у чего нет runtime. `schemas/delivery-verification-receipt.schema.json` получает отдельный exact-version dispatch, не accept любой версии. Общие report/receipt/source/delivery/inventory identities и opaque Job maps сохраняются; proof Internal answers должен привязывать response slots + generated server bytes + smoke controls. Отсутствие такого proof — failclosed.

`tools/stage_courses.py` использует classification/validate_release_receipt; native gate требует полное покрытие и отсутствие candidate. `tools/native-course-payload.mjs:18`, `tools/publish-receipt.py:53`, `tools/release_assembly.py:100–102` жёстко связывают deliverySchemaVersion3: их v4 dispatch и release assembly protocol pins обязательны, а не обходятся permissive parse. `tools/build-course.py`/публикационный provenance вызывают эти владельческие проверки. Results runtime schemaVersion/образ не повышается только из-за публичного envelope; image release manifest должен явно объявить поддержанные public versions. Production integration — только ROOT после OTHER.

## Обязательная проверка перед принятием

Roundtrip каждого из пяти native-answer forms, project editor/upload external/mixed/manual и Workspace; rich title/intro/late conditions/citations/bibliography/resources сохраняются из genuine accepted Core operation. Проверить actual info.json+HTML controls+server.py+seed ZIP, duplicate slots/UUID, forged kind/method, answerKey/client leak, missing/extra automatic proof, receipt/report recomputation, delivery/file/seed tamper, wrong A/origin/common files, malformed/aliased/expired/source-changed Core bindings. v3 corpus должен проходить без новой формы и отвергать v4; v4 нельзя понизить до v3 удалением kind. Обе SP поставки ZIP+Git Workspace/new seed остаются releaseOPEN до этих readers и независимой проверки.
