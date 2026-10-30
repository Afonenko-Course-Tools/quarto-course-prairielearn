"""Exact SP recipe: прежняя и новая доверенные closure дают один A/S0/S1."""
import ast
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

pl = Path(__file__).resolve().parents[1]
sp = Path(sys.argv[1]).resolve(strict=True)
module = pl / '_extensions/course-prairielearn/application/trusted-git'
provenance = json.loads((module / 'provenance.json').read_text())
assert subprocess.check_output(['git', '-C', str(sp), 'rev-parse', 'HEAD']).decode().strip() == provenance['commit']
own = (module / 'build_git_materials.py').read_text()
functions = {n.name: ast.get_source_segment(own, n) for n in ast.parse(own).body if isinstance(n, ast.FunctionDef)}
assert set(functions) == set(provenance['functions']), 'Новый учебный generate/build не разрешён'
for name, record in provenance['functions'].items():
    data = subprocess.check_output(['git', '-C', str(sp), 'show', provenance['commit'] + ':' + record['path']])
    source = data.decode()
    original = next(ast.get_source_segment(source, n) for n in ast.parse(source).body if isinstance(n, ast.FunctionDef) and n.name == name)
    assert hashlib.sha256(data).hexdigest() == record['sourceSha256']
    assert functions[name] == original
    assert hashlib.sha256(original.encode()).hexdigest() == record['functionSha256']

probe = r'''
import importlib.util,json,sys
from pathlib import Path
from build_git_materials import git,commit
recipe=Path(sys.argv[1]);work=Path(sys.argv[2]);template=Path(sys.argv[3]);template.mkdir()
spec=importlib.util.spec_from_file_location('recipe',recipe);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
initial=module.generate(work,template)
def state():
 return {'head':git(work,'rev-parse','HEAD').decode().strip(),'refs':git(work,'show-ref').decode(),'index':(work/'.git/index').read_bytes().hex(),'files':{p.name:p.read_bytes().hex() for p in work.iterdir() if p.is_file()},'objects':git(work,'cat-file','--batch-all-objects','--batch-check=%(objectname) %(objecttype) %(objectsize)').decode()}
states={'initial':initial,'current':state(),'committed':{}}
for key in ['A','S0','S1']:
 if key in initial:
  oid=initial[key];names=git(work,'ls-tree','-r','--name-only',oid).decode().splitlines()
  states['committed'][key]={name:git(work,'show',oid+':'+name).hex() for name in names}
print(json.dumps(states,sort_keys=True))
'''
receipts=[]
with tempfile.TemporaryDirectory(prefix='pl-git-helper-') as tmp:
    for recipe in ['restore-selected-state','github-ssh']:
        results=[]
        for name, helper in [('old', sp / 'tools'), ('new', module)]:
            stage = Path(tmp) / (recipe+'-'+name)
            stage.mkdir()
            run = subprocess.run([sys.executable, '-c', probe, str(sp / ('tasks/projects/version-control/'+recipe+'/seed_recipe.py')), str(stage / 'work'), str(stage / 'template')], env={**os.environ, 'PYTHONPATH': str(helper), 'PYTHONDONTWRITEBYTECODE': '1'}, capture_output=True, text=True, check=True)
            results.append(json.loads(run.stdout))
        assert results[0] == results[1], 'A/S0/S1/refs/index/worktree/objects изменены'
        if recipe=='restore-selected-state':
            assert results[1]['initial']['A'] == '2f12c0ccccc3c10c483502559fa7efee33a52607'
            assert set(results[1]['committed'])=={'A'}
        else:
            assert set(results[1]['committed'])=={'S0','S1'}
            assert results[1]['initial']['S0']!=results[1]['initial']['S1']
        receipts.append({'recipe':recipe,'commits':{key:value for key,value in results[1]['initial'].items() if key in ['A','S0','S1']},'state':'committed contents/refs/index/worktree/all objects equal'})
print(json.dumps({'exactFunctionBodies': len(functions), 'canonicalRecipeOldNew': 'PASS', 'recipes':receipts}, ensure_ascii=False))
