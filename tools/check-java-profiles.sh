#!/usr/bin/env bash
set -euo pipefail
bank=${1:?Pass the installed Java bank directory}
cd "$bank"
mkdir -p .quarto
for profile in student full student; do
  quarto inspect . --profile "$profile" > ".quarto/profile-inspect.json"
  python3 - "$profile" <<'PY'
import json,sys
from pathlib import Path
profile=sys.argv[1]
config=json.loads(Path('.quarto/profile-inspect.json').read_text())['config']
expected=['index.qmd','tasks.qmd']
if profile=='full': expected+=['control.qmd','variant-a.qmd','variant-b.qmd']
chapters=config['book']['chapters']
assert chapters==expected, (profile,chapters,expected)
assert config['project']['output-dir']==f'_book/{profile}', config['project']
PY
  quarto render --profile "$profile" --fail-if-warnings
  quarto run _extensions/Afonenko-Course-Tools/course-core/entrypoints/check.ts . "$profile"
  python3 - "$profile" <<'PY'
import json,sys
from pathlib import Path
profile=sys.argv[1]; output=Path('_book')/profile
pages={p.name for p in output.glob('*.html')}
expected={'index.html','tasks.html'}
if profile=='full': expected|={'control.html','variant-a.html','variant-b.html'}
assert pages==expected, (profile,pages,expected)
texts=[p.read_text() for p in output.glob('*.html')]
assert all('lang="ru"' in text for text in texts)
task=(output/'tasks.html').read_text()
assert ('Закрытые тесты проверяют равные границы' in task)==(profile=='full')
search=(output/'search.json').read_text()
if profile=='student':
    for private in ['control.html','variant-a.html','variant-b.html','Все закрытые проверки граничных случаев должны пройти','Закрытые тесты проверяют равные границы']:
        assert private not in search and all(private not in text for text in texts), private
else:
    assert 'control.html' in search and 'variant-b.html' in search
    assert 'Все закрытые проверки граничных случаев должны пройти' in (output/'control.html').read_text()
print('PASS native '+profile+' chapter, navigation, search and private-note boundaries')
PY
done
