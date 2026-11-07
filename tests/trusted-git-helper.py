"""Точные SP recipes и два модуля closure сохраняют A/S0/S1 и Git-состояние."""
import ast
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
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


def is_list(value: object) -> TypeGuard[list[object]]:
    return isinstance(value, list)


def items(value: object) -> list[object]:
    if not is_list(value):
        raise ValueError('Ожидался JSON array')
    return list(value)


def relative(value: object) -> str:
    path = text(value)
    parts = PurePosixPath(path)
    if not path or parts.is_absolute() or '..' in parts.parts or path != parts.as_posix() or '\\' in path:
        raise ValueError('Ожидался безопасный относительный source path')
    return path


pl = Path(__file__).resolve().parents[1]
sp = Path(sys.argv[1]).resolve(strict=True)
module = pl / '_extensions/course-prairielearn/application/trusted-git'
fixtures = pl / 'tests/fixtures/git-recipes'
provenance = fields(json.loads((module / 'provenance.json').read_text()))
fixture_provenance = fields(json.loads((fixtures / 'provenance.json').read_text()))
source_commit = text(provenance['commit'])
assert source_commit == '6b4ffbe35a018678a0bf6bb3e7f99bcf794bf204'
assert fixture_provenance['sourceCommit'] == source_commit
source_tree = subprocess.check_output(['git', '-C', str(sp), 'rev-parse', source_commit + '^{tree}']).decode().strip()
assert source_tree == provenance['tree'] == fixture_provenance['sourceTree']
source_cache: dict[str, bytes] = {}
source_blobs: dict[str, str] = {}


def source_bytes(path: str) -> bytes:
    if path not in source_cache:
        source_cache[path] = subprocess.check_output(['git', '-C', str(sp), 'show', source_commit + ':' + path])
    return source_cache[path]


def source_blob(path: str) -> str:
    if path not in source_blobs:
        source_blobs[path] = subprocess.check_output(['git', '-C', str(sp), 'rev-parse', source_commit + ':' + path]).decode().strip()
    return source_blobs[path]


expected: dict[str, dict[str, tuple[str, str]]] = {
    'build_git_materials.py': {
        'GitState': ('ClassDef', 'tools/build_git_materials.py'),
        'target': ('FunctionDef', 'tools/build_materials.py'),
        **{name: ('FunctionDef', 'tools/build_git_materials.py') for name in ['git_env', 'git', 'put', 'commit', 'initialize', 'normalize']},
    },
    'system_support.py': {
        'ArchiveError': ('ClassDef', 'tools/system_support.py'),
        **{name: ('FunctionDef', 'tools/system_support.py') for name in ['safe_archive_name', 'read_json', '_object_container', 'json_object', 'json_string', 'json_texts']},
    },
}
expected_imports: dict[str, list[str]] = {
    'build_git_materials.py': ['from collections.abc import Mapping', 'from typing import TypedDict', 'from pathlib import Path, PurePosixPath', 'import os', 'import shutil', 'import subprocess', 'from system_support import safe_archive_name'],
    'system_support.py': ['from collections.abc import Mapping', 'from typing import TypeGuard', 'from pathlib import Path, PurePosixPath', 'import json'],
}
modules = fields(provenance['modules'])
assert set(modules) == set(expected), 'Разрешены ровно два минимальных runtime-модуля'
assert {path.name for path in module.glob('*.py')} == set(expected)
symbol_count = 0
for name, symbols in expected.items():
    details = fields(modules[name])
    data = (module / name).read_bytes()
    assert hashlib.sha256(data).hexdigest() == details['sha256']
    assert len(data) == details['size']
    own = data.decode()
    body = ast.parse(own).body
    imports = [ast.get_source_segment(own, node) for node in body if isinstance(node, (ast.Import, ast.ImportFrom))]
    assert imports == expected_imports[name] == details['imports']
    assert all(isinstance(node, (ast.Import, ast.ImportFrom, ast.FunctionDef, ast.ClassDef)) for node in body)
    declarations = [node for node in body if isinstance(node, (ast.FunctionDef, ast.ClassDef))]
    assert len(declarations) == len(symbols)
    assert {node.name for node in declarations} == set(symbols), 'Новый учебный generate/build не разрешён'
    lineage = fields(details['symbols'])
    assert set(lineage) == set(symbols)
    for node in declarations:
        entry = fields(lineage[node.name])
        kind, source_path = symbols[node.name]
        assert entry['kind'] == kind == type(node).__name__
        assert entry['sourcePath'] == source_path
        original_bytes = source_bytes(source_path)
        assert hashlib.sha256(original_bytes).hexdigest() == entry['sourceBlobSha256']
        assert source_blob(source_path) == entry['sourceBlob']
        source = original_bytes.decode()
        originals = [item for item in ast.parse(source).body if isinstance(item, (ast.FunctionDef, ast.ClassDef)) and item.name == node.name]
        assert len(originals) == 1
        original = originals[0]
        assert type(original).__name__ == kind
        assert original.lineno == entry['sourceStartLine'] and original.end_lineno == entry['sourceEndLine']
        segment = ast.get_source_segment(source, original)
        assert segment is not None and ast.get_source_segment(own, node) == segment
        assert hashlib.sha256(segment.encode()).hexdigest() == entry['sourceSegmentSha256']
        symbol_count += 1

probe = Path(__file__).with_name('trusted-git-probe.py')
receipts: list[dict[str, object]] = []
with tempfile.TemporaryDirectory(prefix='pl-git-helper-') as tmp:
    canonical = Path(tmp) / 'canonical'
    for path in ['tools/build_git_materials.py', 'tools/build_materials.py', 'tools/system_support.py']:
        destination = canonical / path
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(source_bytes(path))
    fixture_root = relative(fixture_provenance['root'])
    assert fixture_root == 'tasks/projects/version-control'
    expected_assets = {
        'github-ssh/seed_recipe.py', 'github-ssh/seed.json', 'github-ssh/student/README.md',
        'restore-selected-state/seed_recipe.py', 'restore-selected-state/student/work/README.md', 'restore-selected-state/student/work/notes.txt',
    }
    seen: set[str] = set()
    for value in items(fixture_provenance['files']):
        entry = fields(value)
        path = relative(entry['path'])
        assert path in expected_assets and path not in seen
        seen.add(path)
        data = source_bytes(fixture_root + '/' + path)
        assert hashlib.sha256(data).hexdigest() == entry['sha256'] and len(data) == entry['size']
        assert (fixtures / path).read_bytes() == data
        destination = canonical / fixture_root / path
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(data)
    assert seen == expected_assets
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
print(json.dumps({'sourceCommit': source_commit, 'exactSymbols': symbol_count, 'exactModules': len(modules), 'canonicalRecipeOldNew': 'PASS', 'recipes': receipts}, ensure_ascii=False))
