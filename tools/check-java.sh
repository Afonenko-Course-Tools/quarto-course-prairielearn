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
python3 - "$stage" <<'PY'
import json,sys
from pathlib import Path
root=Path(sys.argv[1]);site=root/'_site'
assert 'FUNCTIONAL_PROFILE_CONDITION' in (root/'cli-delivery/questions/demo-java-gradle/exr-clamp/question.html').read_text()
assert (site/'index.html').is_file() and (site/'BUILD.json').is_file()
for variant,exercise in [('a','exr-clamp'),('b','exr-control')]:
 q=site/'artifacts'/f'variant-{variant}'/'questions'/'demo-java-gradle'/exercise
 info=json.loads((q/'info.json').read_text());html=(q/'question.html').read_text()
 assert info['gradingMethod']=='External' and info['partialCredit'] is False
 assert (q/'tests'/'ClampChecks.java').is_file() and (q/'clientFilesQuestion'/'Clamp.java').is_file()
 assert 'CONTROL_GRADING' not in html and 'Private tests' not in html
 assert 'reference' not in [p.name for p in (q/'clientFilesQuestion').iterdir()]
 assert (q/'tests'/'grade.sh').is_file()
PY
if [[ -n ${DEMO_OUTPUT:-} ]]; then mkdir -p "$(dirname "$DEMO_OUTPUT")"; [[ ! -e "$DEMO_OUTPUT" ]] || { echo "DEMO_OUTPUT must be a fresh directory" >&2; exit 1; }; cp -R "$stage/_site" "$DEMO_OUTPUT"; fi
