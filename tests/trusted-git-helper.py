"""Точные SP recipes и два модуля closure сохраняют A/S0/S1 и Git-состояние."""
import ast
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from typing import TypeGuard


def is_mapping(value: object) -> TypeGuard[dict[object, object]]:
    return isinstance(value, dict)


def fields(value: object) -> dict[str, object]:
    if not is_mapping(value):
        raise ValueError('Ожидался JSON object')
    result: dict[str, object] = {}
    for key, item in value.items():
        if not isinstance(key, str):
            raise ValueError('Ожидался строковый ключ')
        result[key] = item
    return result


def text(value: object) -> str:
    if not isinstance(value, str):
        raise ValueError('Ожидалась строка')
    return value


pl = Path(__file__).resolve().parents[1]
sp = Path(sys.argv[1] if len(sys.argv) > 1 else pl / 'vendor-sources/system-practice').resolve(strict=True)
module = pl / '_extensions/course-prairielearn/application/trusted-git'
fixtures = pl / 'tests/fixtures/git-recipes'
source_commit = subprocess.check_output(['git', '-C', str(sp), 'rev-parse', 'HEAD']).decode().strip()


def source_bytes(path: str) -> bytes:
    return subprocess.check_output(['git', '-C', str(sp), 'show', 'HEAD:' + path])


# Минимальная trusted runtime поверхность: учебные builders и top-level effects
# не должны попасть в устанавливаемый автономный пакет.
expected_imports: dict[str, list[str]] = {
    'build_git_materials.py': [
        'from collections.abc import Mapping', 'from typing import TypedDict',
        'from pathlib import Path, PurePosixPath', 'import os', 'import shutil',
        'import subprocess', 'from system_support import safe_archive_name',
    ],
    'system_support.py': [
        'from collections.abc import Mapping', 'from typing import TypeGuard',
        'from pathlib import Path, PurePosixPath', 'import json',
    ],
}
assert {path.name for path in module.glob('*.py')} == set(expected_imports)
for name, imports in expected_imports.items():
    own = (module / name).read_text()
    body = ast.parse(own).body
    assert all(isinstance(node, (ast.Import, ast.ImportFrom, ast.FunctionDef, ast.ClassDef))
               for node in body), 'Прямые исполняемые top-level statements запрещены'
    assert [ast.get_source_segment(own, node) for node in body
            if isinstance(node, (ast.Import, ast.ImportFrom))] == imports

probe = Path(__file__).with_name('trusted-git-probe.py')
receipts: list[dict[str, object]] = []
with tempfile.TemporaryDirectory(prefix='pl-git-helper-') as tmp:
    canonical = Path(tmp) / 'canonical'
    for path in ['tools/build_git_materials.py', 'tools/build_materials.py', 'tools/system_support.py']:
        destination = canonical / path
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(source_bytes(path))
    fixture_root = 'tasks/projects/version-control'
    expected_assets = {
        'github-ssh/seed_recipe.py', 'github-ssh/seed.json', 'github-ssh/student/README.md',
        'restore-selected-state/seed_recipe.py', 'restore-selected-state/student/work/README.md', 'restore-selected-state/student/work/notes.txt',
    }
    for path in expected_assets:
        data = source_bytes(fixture_root + '/' + path)
        assert (fixtures / path).read_bytes() == data
        destination = canonical / fixture_root / path
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(data)
    for recipe in ['restore-selected-state', 'github-ssh']:
        results: list[dict[str, object]] = []
        recipe_path = canonical / fixture_root / recipe / 'seed_recipe.py'
        for label, helper in [('old', canonical / 'tools'), ('new', module)]:
            stage = Path(tmp) / (recipe + '-' + label)
            stage.mkdir()
            run = subprocess.run([sys.executable, '-S', '-B', str(probe), str(recipe_path), str(stage / 'work'), str(stage / 'template')], env={**os.environ, 'PYTHONPATH': str(helper), 'PYTHONDONTWRITEBYTECODE': '1'}, capture_output=True, text=True, check=True)
            results.append(fields(json.loads(run.stdout)))
        assert results[0] == results[1], 'A/S0/S1/refs/index/worktree/objects изменены'
        initial = fields(results[1]['initial'])
        committed = fields(results[1]['committed'])
        if recipe == 'restore-selected-state':
            assert initial['A'] == '2f12c0ccccc3c10c483502559fa7efee33a52607'
            assert set(committed) == {'A'}
        else:
            assert set(committed) == {'S0', 'S1'}
            assert initial['S0'] != initial['S1']
        receipts.append({'recipe': recipe, 'commits': {key: value for key, value in initial.items() if key in ['A', 'S0', 'S1']}, 'state': 'committed contents/refs/index/worktree/all objects equal'})
print(json.dumps({'sourceCommit': source_commit, 'canonicalRecipeOldNew': 'PASS', 'recipes': receipts}, ensure_ascii=False))
