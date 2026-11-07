"""Проверяемый прежний probe old/new helper без изменения импортированной closure."""
import importlib
import importlib.util
import json
from pathlib import Path
import sys
from typing import TypeGuard


def is_mapping(value: object) -> TypeGuard[dict[object, object]]:
    return isinstance(value, dict)


def fields(value: object) -> dict[str, object]:
    if not is_mapping(value):
        raise ValueError('Recipe должен вернуть mapping')
    result: dict[str, object] = {}
    for key, item in value.items():
        if not isinstance(key, str):
            raise ValueError('Recipe должен вернуть строковые ключи')
        result[key] = item
    return result


helper = importlib.import_module('build_git_materials')
git_operation: object = getattr(helper, 'git', None)
if not callable(git_operation):
    raise ValueError('В импортированном helper отсутствует git')


def git(root: Path, *args: str) -> bytes:
    operation = git_operation
    if not callable(operation):
        raise ValueError('В импортированном helper отсутствует git')
    value: object = operation(root, *args)
    if not isinstance(value, bytes):
        raise ValueError('Импортированный git должен вернуть bytes')
    return value


recipe = Path(sys.argv[1])
work = Path(sys.argv[2])
template = Path(sys.argv[3])
template.mkdir()
spec = importlib.util.spec_from_file_location('recipe', recipe)
if spec is None or spec.loader is None:
    raise ValueError('Загрузчик канонического recipe недоступен')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
generate: object = getattr(module, 'generate', None)
if not callable(generate):
    raise ValueError('В каноническом recipe отсутствует generate')
initial = fields(generate(work, template))


def state() -> dict[str, object]:
    return {
        'head': git(work, 'rev-parse', 'HEAD').decode().strip(),
        'refs': git(work, 'show-ref').decode(),
        'index': (work / '.git/index').read_bytes().hex(),
        'files': {p.name: p.read_bytes().hex() for p in work.iterdir() if p.is_file()},
        'objects': git(work, 'cat-file', '--batch-all-objects',
                       '--batch-check=%(objectname) %(objecttype) %(objectsize)').decode(),
    }


committed: dict[str, dict[str, str]] = {}
states: dict[str, object] = {'initial': initial, 'current': state(), 'committed': committed}
for key in ['A', 'S0', 'S1']:
    if key in initial:
        oid = initial[key]
        if not isinstance(oid, str):
            raise ValueError('Recipe должен вернуть строковый commit')
        names = git(work, 'ls-tree', '-r', '--name-only', oid).decode().splitlines()
        committed[key] = {name: git(work, 'show', oid + ':' + name).hex() for name in names}
print(json.dumps(states, sort_keys=True))
