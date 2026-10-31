"""Generate the single R1 seed into an EMPTY stage directory, never source .git.
Caller supplies canonical tools directory via PYTHONPATH. No archive assembly.
"""
import json
from pathlib import Path
from build_git_materials import initialize,commit,normalize


def generate(destination,empty_template):
    spec=json.loads(Path(__file__).with_name('seed.json').read_text())
    initialize(destination,empty_template)
    s0=commit(destination,spec['S0'],'Добавлен первый прибор')
    s1=commit(destination,spec['S1'],'Добавлен второй прибор')
    return {'S0':s0,'S1':s1,**normalize(destination)}
