"""Create only published initial A in an EMPTY stage. Canonical Git helpers read-only.
No solution history/archive assembly. Caller supplies canonical tools via PYTHONPATH.
"""
from pathlib import Path
from build_git_materials import initialize,commit,normalize

def generate(destination,empty_template):
    source=Path(__file__).with_name('student')/'work'
    initialize(destination,empty_template)
    a=commit(destination,{name:(source/name).read_text() for name in ['README.md','notes.txt']},'Начальное состояние учебного проекта')
    return {'A':a,**normalize(destination)}
