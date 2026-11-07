"""Generate the single R1 seed into an EMPTY stage directory, never source .git.
Caller supplies canonical tools directory via PYTHONPATH. No archive assembly.
"""
from pathlib import Path
from build_git_materials import GitState,initialize,commit,normalize
from system_support import read_json, json_object, json_texts


class SeedState(GitState):
    S0: str
    S1: str


def generate(destination: Path, empty_template: Path) -> SeedState:
    spec={name: json_texts(files) for name, files in json_object(read_json(Path(__file__).with_name('seed.json'))).items()}
    initialize(destination,empty_template)
    s0=commit(destination,spec['S0'],'Добавлен первый прибор')
    s1=commit(destination,spec['S1'],'Добавлен второй прибор')
    return {'S0':s0,'S1':s1,**normalize(destination)}
