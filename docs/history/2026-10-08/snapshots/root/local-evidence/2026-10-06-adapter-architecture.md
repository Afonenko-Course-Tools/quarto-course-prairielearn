# Adapter architecture and implementation — 6/7 October 2026

Current source base was refreshed from origin/main before implementation on
`feat/course-contract-20261006`. The earlier pre-refresh P0 audit is superseded:
Print/Moodle main already used only current `course-body-package-v1`.
Read START-CODEX, root AGENTS, common changes/review/examples-release plans,
Core model plan, actual adapter READMEs/specs/code/tests and installed contracts.

| Adapter | Actual dependencies and API | Candidate changes |
| --- | --- | --- |
| Print 0.2.0 | Public Core Body package; `preparePrint(input,workKey,header)`, `renderPrint(input,workKey,out,header,options)`; native `quarto pandoc`/`quarto typst compile`, bundled recipe/fonts, Deno | handout, optional/required work map, current generic work-ID grammar, optional label; no grading formula |
| Moodle 0.2.0 | Teacher Core Body package; `exportMoodle(package,binding) -> XML`; vendored XML writer, native Pandoc HTML/MathML | Same current work grammar/map; selected-work question export; essay/single-choice only; no activity creation |
| PrairieLearn 2.1.0 | Core native collection/model + CUE; `exportPrairieLearn(publicPackage,{projectRoot,projects},binding,out)`; explicit installed root/book/work CLI | Actual native question delivery (`info.json`, `question.html`, public starter/clientFilesQuestion, private tests); deterministic UUID; literal Mustache protection; selected closure and symlink checks; explicit image/files/grading binding; no assessments/container/server manager |
| Cloud 2.1.0 | Core-before-adapter, native sidecar/CUE; steps/actions/VMs/prepare metadata | task-items, native content-visible profile conditions, optional course identity/target; full-ready standalone demo; VM execution remains separate |
| Download 1.1.0 | Native shortcode/filter/hooks; ordinary resources have no Core/CUE dependency; optional course-model bridge reads exercise id/source/project; public ownership API unchanged | Current Core CI pin and native profile syntax/tests; no runtime bridge or ownership changes |

Core API coordinated directly with its implementer:
`collectExport(courseRoot,{book,work,profiles?}) -> {result,projectRoot,courseId,work}`
from installed `body-export/collect.ts`; then
`buildBodies(result,{projectRoot,courseId,work,includeClosed:true})` returns
teacher package + publicPackage. Selected work closure precedes body capability
checks. Root course ID is declared once; full source capture includes control
QMD excluded from student HTML and needs no full HTML render. items stays string[];
requirements maps local exr-ID to required/optional; handout is ungraded.

Concrete refactoring gaps found and fixed with regressions: PL/Cloud CUE formerly
forced target on every native exercise and native.lua unconditionally stringified
missing course.id. Both now preserve ordinary native rendering without owner,
target, role/difficulty or artificial source topic. Print/Moodle formerly assumed
work ID sec-*; they now match the current Core `[a-z][a-z0-9-]*` grammar.
Legacy assessment-items and custom when-full/when-student syntax removed from
adapter authored examples/docs/tests; standard native profile conditions used.

Producer groups are complete self-contained folders:

| Asset | Source group | Ready web root |
| --- | --- | --- |
| paper.tar.gz | quarto-course-print/examples/paper | _site |
| moodle-questions.tar.gz | quarto-course-moodle/examples/questions | _site |
| java-gradle.tar.gz | quarto-course-prairielearn/examples/java-gradle | _site |
| cloud.tar.gz | quarto-course-cloud/examples/course | _book/full |

Print/Moodle/Java groups declare root course.id once, own shared bank/resources,
control source and two fixed work QMDs. Print has ordinary native PDF and two
selected bank PDFs. Unassigned native HTML-only exercise is valid and absent
from selected Print/Moodle transport. Moodle exports two XML questions per variant,
including selected control conditions, excluding solutions/notes/unassigned task.
Java owns starter/reference/private Gradle test project and explicit PL binding;
reference passes six actual checks, incomplete starter fails. Native questions
carry explicit External grading, `partialCredit:false` and separated files.
Cloud demonstrates two VMs and actual native source checks without provisioning.
All groups default full; intentionally public demo answers/tests differ from a
real course. Source links pin corresponding adapter release tags.

Every web root includes index.html, native resources and BUILD.json. BUILD has
full40hex commit from producer Git checkout, sourceDirty, dependency versions and
verification bounds. check-demo/check-java scripts stage/install current candidates
and set actual producer provenance; final clean merged builds must regenerate
these receipts. No QRC is needed in these adapter-only native bank groups.

Fresh local checks completed: Print installed full/student + 27 Deno tests;
Moodle installed full/student + 54 Deno tests; PL metadata full suite, three exporter
unit tests, CUE optional-native model tests and installed native ordinary render;
Cloud full metadata suite, CUE optional-native model, installed ordinary render and
complete namespaced ready demo; Download archive/render/ownership and native installed bridge plus
namespaced/plain/active contexts. Complete logs are /tmp/course-*-tests-final.log,
/tmp/course-pl-checks-final.log, /tmp/course-cloud-checks.log and
/tmp/course-download-{archive,render,ownership,core}.log. Final namespaced PL CLI/demo (including Quarto functional profile + forwarded
delimiter), Cloud selected source capture, Print/Moodle complete-group builds all
passed in /tmp/course-{java,cloud,print,moodle}-demo-final.log. PL ordinary nested-bank
assessment-id mode now defers root identity; explicit export computes exact stable
label, regression GREEN in /tmp/course-pl-identity-green.log.

XDG_CACHE_HOME under /tmp is required in the restricted local environment.
Gradle requires local sockets for its lock service even offline; authorized
escalation was used for actual Gradle execution. No network/container/LMS execution
is claimed. CI uses separate Java environment job, official action SHAs, pinned
Core v3.0.0 and the same installed demo scripts. C++/Python/Julia/R combinations
were not invented; they depend on actual supported adapter scope.

Verified implementation commits: Print ac5e4f3; Moodle 4476649; PL 68e513c;
Cloud 2650469; Download 8fe556e. Every owned working tree clean. Fresh read-only
review ran public transport and exporter regressions; all four PL prose findings
were corrected in final commit.

Ready candidate roots: /tmp/course-paper-site-namespaced,
/tmp/course-moodle-site-namespaced, /tmp/course-java-site-namespaced,
/tmp/course-cloud-site-namespaced. Receipts correctly record candidate precommit
SHA plus sourceDirty=true; coordinator MUST rebuild after clean merge for immutable
release provenance. Native unresolved sec crossrefs may warn during JSON source
capture because cross-document chapter numbering is not part of the transport;
all final HTML uses --fail-if-warnings and succeeds.

Next: coordinator creates/merges PRs and builds all immutable Release
assets from checked clean merged SHAs. Template consumes exact archives explicitly
and stops at local verification; no template Pages publication.

## Actual PR CI failures and clean-layout verification

Failed GitHub runs inspected: Moodle37539378587, PL37539382701, Cloud37539391512.
Root causes reproduced in clean local Git clones with Core checkout at immutable
`aa91437e41d7f5c9686bfef4efe2c7892c11d67e` (v3.0.0):
relative Core path passed after temporary cwd change (PL/Cloud native-ordinary
and latent PL identity); authored Moodle binding accidentally globally ignored;
Java check helper used runner-absent rg; Cloud policy fixture installed plain Core
although its complete example declared GitHub namespace, with local caches masking
the mismatch. Fixes are fixture/resource/verification-only, with no runtime change.

Green clean-layout checks: ordinary PL/Cloud native render and PL root identity;
complete PL metadata suite; complete Cloud policy suite plus complete demo;
complete Moodle demo from clean source; actual Java/Gradle+selected CLI with rg
deliberately unavailable. Logs: /tmp/{cloud,pl,moodle}-ci-layout-{red,green}.log,
/tmp/{cloud,pl}-ci-layout-complete.log, /tmp/pl-java-ci-layout-green.log.
Focused commits: Moodle063f30e, PL87fb700, Cloud6a1b633 plus b726d9e namespace fixture. Parent will push and rerun the actual CI matrix.
