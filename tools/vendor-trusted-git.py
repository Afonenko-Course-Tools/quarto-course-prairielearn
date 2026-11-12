"""Собрать минимальный trusted-git closure из выбранного native Git submodule."""
import ast
from pathlib import Path
import subprocess


root = Path(__file__).resolve().parents[1]
source = root / 'vendor-sources/system-practice'
destination = root / '_extensions/course-prairielearn/application/trusted-git'


def original(path: str) -> bytes:
    return subprocess.check_output(['git', '-C', str(source), 'show', 'HEAD:' + path])


modules: dict[str, tuple[list[str], list[tuple[str, str]]]] = {
    'build_git_materials.py': (
        ['from collections.abc import Mapping', 'from typing import TypedDict',
         'from pathlib import Path, PurePosixPath', 'import os', 'import shutil',
         'import subprocess', 'from system_support import safe_archive_name'],
        [('GitState', 'tools/build_git_materials.py'), ('target', 'tools/build_materials.py')]
        + [(name, 'tools/build_git_materials.py') for name in
           ['git_env', 'git', 'put', 'commit', 'initialize', 'normalize']],
    ),
    'system_support.py': (
        ['from collections.abc import Mapping', 'from typing import TypeGuard',
         'from pathlib import Path, PurePosixPath', 'import json'],
        [(name, 'tools/system_support.py') for name in
         ['ArchiveError', 'safe_archive_name', 'read_json', '_object_container',
          'json_object', 'json_string', 'json_texts']],
    ),
}
for name, (imports, symbols) in modules.items():
    segments: list[str] = []
    for symbol, path in symbols:
        text = original(path).decode()
        nodes = [node for node in ast.parse(text).body
                 if isinstance(node, (ast.FunctionDef, ast.ClassDef)) and node.name == symbol]
        if len(nodes) != 1:
            raise ValueError(f'Неоднозначный upstream symbol: {path}:{symbol}')
        segment = ast.get_source_segment(text, nodes[0])
        if segment is None:
            raise ValueError(f'Нет upstream source segment: {path}:{symbol}')
        segments.append(segment)
    # Сохраняем формат существующего standalone bundle.
    (destination / name).write_text('\n'.join(imports) + '\n\n\n'
                                    + '\n\n\n'.join(segments) + '\n')

fixture_root = 'tasks/projects/version-control/'
for path in [
    'github-ssh/seed_recipe.py', 'github-ssh/seed.json', 'github-ssh/student/README.md',
    'restore-selected-state/seed_recipe.py', 'restore-selected-state/student/work/README.md',
    'restore-selected-state/student/work/notes.txt',
]:
    output = root / 'tests/fixtures/git-recipes' / path
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(original(fixture_root + path))

print(subprocess.check_output(['git', '-C', str(source), 'rev-parse', 'HEAD']).decode().strip())
