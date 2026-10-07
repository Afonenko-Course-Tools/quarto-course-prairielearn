#!/usr/bin/env bash
set -euo pipefail
repo=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
export DEMO_SOURCE_COMMIT="$(git -C "$repo" rev-parse HEAD)"
if [[ -n $(git -C "$repo" status --porcelain) ]]; then export DEMO_SOURCE_DIRTY=true; else export DEMO_SOURCE_DIRTY=false; fi
core=${CORE:?Set CORE to the current Core source}
stage=$(mktemp -d "${TMPDIR:-/tmp}/pl-java-demo.XXXXXXXX")
trap 'rm -rf "$stage"' EXIT
cp -R "$repo/examples/java-gradle/." "$stage/"
rm -rf "$stage/_site" "$stage/artifacts" "$stage/bank/_extensions" "$stage/bank/_generated" "$stage/bank/.quarto" "$stage/.quarto" "$stage/bank/projects/clamp/tests/build" "$stage/bank/projects/clamp/tests/.gradle"
cd "$stage/bank"
quarto add "$core" --no-prompt
mkdir -p _extensions/Afonenko-Course-Tools
mv _extensions/course-core _extensions/Afonenko-Course-Tools/course-core
quarto add "$repo" --no-prompt
cd "$stage"
quarto run build.ts
quarto run bank/_extensions/course-prairielearn/entrypoints/export.ts --profile feature -- . bank sec-variant-a binding.json "$stage/cli-delivery"
[[ -f "$stage/cli-delivery/questions/demo-java-gradle/exr-clamp/info.json" ]]
[[ ! -e "$stage/cli-delivery/questions/demo-java-gradle/exr-control" ]]
if quarto run bank/_extensions/course-prairielearn/entrypoints/export.ts -- . bank sec-missing binding.json "$stage/failed-delivery" > "$stage/failed-cli.stdout" 2> "$stage/failed-cli.stderr"; then
  echo "Неизвестная работа была экспортирована" >&2
  exit 1
fi
[[ ! -e "$stage/failed-delivery" ]]
bash "$repo/tools/check-java-profiles.sh" "$stage/bank"
cd "$stage"
python3 - "$stage" <<'PY'
import json,sys
from pathlib import Path
root=Path(sys.argv[1]);site=root/'_site'
assert 'Проверьте равные границы, отрицательные числа и предельные значения' in (root/'cli-delivery/questions/demo-java-gradle/exr-clamp/question.html').read_text()
assert (site/'index.html').is_file() and (site/'BUILD.json').is_file()
assert 'lang="ru"' in (site/'index.html').read_text()
assert 'Файлы поставки' in (site/'index.html').read_text()
bank=(root/'bank/_book/full/index.html').read_text()
assert 'lang="ru"' in bank and 'Общий банк заданий Java' in bank
failure=(root/'failed-cli.stderr').read_text()
assert failure.count('BODY.WORK_MISSING')==1 and 'sec-missing' in failure
assert 'ADAPTER' not in failure and 'at file://' not in failure
for variant,exercise in [('a','exr-clamp'),('b','exr-control')]:
 q=site/'artifacts'/f'variant-{variant}'/'questions'/'demo-java-gradle'/exercise
 info=json.loads((q/'info.json').read_text());html=(q/'question.html').read_text()
 text=' '.join(html.split())
 assert info['gradingMethod']=='External' and info['partialCredit'] is False
 assert (q/'tests'/'ClampChecks.java').is_file() and (q/'clientFilesQuestion'/'Clamp.java').is_file()
 assert 'Все закрытые проверки граничных случаев должны пройти' not in html and 'Закрытые тесты проверяют равные границы' not in html
 assert 'reference' not in [p.name for p in (q/'clientFilesQuestion').iterdir()]
 assert (q/'tests'/'grade.sh').is_file()
 assert ('результат должен принадлежать' if variant=='a' else 'объясните поведение на его границах') in text, html
PY
if [[ -n ${DEMO_OUTPUT:-} ]]; then mkdir -p "$(dirname "$DEMO_OUTPUT")"; [[ ! -e "$DEMO_OUTPUT" ]] || { echo "DEMO_OUTPUT must be a fresh directory" >&2; exit 1; }; cp -R "$stage/_site" "$DEMO_OUTPUT"; fi
