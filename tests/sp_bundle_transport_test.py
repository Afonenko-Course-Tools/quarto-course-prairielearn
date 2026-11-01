"""Предметные controls bundle-upload; автоматический Manual зачёт не вводится."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
import zipfile

ENV = {k:v for k,v in os.environ.items() if not k.startswith('GIT_')}
ENV.update(GIT_CONFIG_NOSYSTEM='1',GIT_CONFIG_GLOBAL='/dev/null',GIT_TERMINAL_PROMPT='0',
           GIT_AUTHOR_NAME='Fixture',GIT_AUTHOR_EMAIL='fixture@example.invalid',
           GIT_COMMITTER_NAME='Fixture',GIT_COMMITTER_EMAIL='fixture@example.invalid')
MEASUREMENTS = b'sensor\tlatency_ms\nnorth\t18\nsouth\t28\n'

def git(root,*args,check=True,input=None):
    result=subprocess.run(['git','-c','core.hooksPath=/dev/null','-c','core.fsmonitor=false',*args],cwd=root,env=ENV,input=input,capture_output=True,text=True)
    if check and result.returncode:
        raise AssertionError(result.stderr)
    return result if not check else result.stdout.strip()

class BundleTransport(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='sp-bundle-')
        self.root=Path(self.temp.name)
        self.work=self.root/'original'
        self.work.mkdir()
        git(self.work,'init','--initial-branch=main')
        (self.work/'README.md').write_text('Измерения задержки в миллисекундах; в отчёт входят значения не выше порога criteria.txt.\n')
        (self.work/'measurements.tsv').write_bytes(MEASUREMENTS)
        (self.work/'criteria.txt').write_text('latency_limit = 25 ms\n')
        self.a=self.commit('A')
        (self.work/'criteria.txt').write_text('latency_limit = 30 ms\n')
        self.b=self.commit('B')
        git(self.work,'switch','-c','seconds',self.a)
        (self.work/'criteria.txt').write_text('latency_limit = 0.025 s\n')
        with (self.work/'README.md').open('a') as file:file.write('Порог записывается в секундах.\n')
        self.f=self.commit('F')
        git(self.work,'switch','main')
        conflict=git(self.work,'merge','--no-ff','seconds',check=False)
        self.assertNotEqual(conflict.returncode,0)
        self.assertTrue((self.work/'.git/MERGE_HEAD').exists())
        (self.work/'criteria.txt').write_text('latency_limit = 0.030 s\n')
        self.d=self.commit('Согласовать увеличение и секунды')

    def tearDown(self):self.temp.cleanup()

    def commit(self,message):
        git(self.work,'add','.')
        git(self.work,'commit','-qm',message)
        return git(self.work,'rev-parse','HEAD')

    def restore(self,refs):
        bundle=self.root/'history.bundle'
        git(self.work,'bundle','create',str(bundle),*refs)
        # Внешний архив переносит bundle и существующие материалы; .git/config/hooks не импортируются.
        archive=self.root/'solution.zip'
        with zipfile.ZipFile(archive,'w') as z:
            z.write(bundle,'versioning/history.bundle')
            z.writestr('versioning/explanation.md','Короткое пояснение; действия предъявляются на разборе.\n')
            for name in ['README.md','criteria.txt','measurements.tsv']:
                z.write(self.work/name,'versioning/project/'+name)
        imported=self.root/'imported'
        imported.mkdir()
        with zipfile.ZipFile(archive) as z:z.extractall(imported)
        empty=self.root/'empty'
        empty.mkdir()
        git(empty,'init','--initial-branch=verification-empty')
        result=git(empty,'bundle','verify',str(imported/'versioning/history.bundle'),check=False)
        if result.returncode:return result,None
        git(empty,'fetch',str(imported/'versioning/history.bundle'),'refs/heads/*:refs/heads/*')
        git(empty,'switch','main')
        return result,empty

    def test_self_contained_bundle_restores_graph_refs_and_content_without_original(self):
        result,restored=self.restore(['--all'])
        self.assertEqual(result.returncode,0)
        self.assertEqual(git(restored,'rev-parse','HEAD'),self.d)
        self.assertEqual(set(git(restored,'rev-list','--parents','-1',self.d).split()[1:]),{self.b,self.f})
        self.assertEqual(git(restored,'rev-parse','seconds'),self.f)
        self.assertNotEqual(git(restored,'merge-base','--is-ancestor',self.b,self.f,check=False).returncode,0)
        self.assertNotEqual(git(restored,'merge-base','--is-ancestor',self.f,self.b,check=False).returncode,0)
        self.assertEqual((restored/'measurements.tsv').read_bytes(),MEASUREMENTS)
        self.assertEqual((restored/'criteria.txt').read_text(),'latency_limit = 0.030 s\n')
        # Чистота этого checkout не устанавливает исходную чистоту: меняем только оригинал.
        (self.work/'untracked.txt').write_text('исходная работа грязная\n')
        self.assertEqual(git(restored,'status','--porcelain'),'')
        self.assertNotEqual(git(self.work,'status','--porcelain'),'')

    def test_incremental_bundle_needs_missing_prerequisite(self):
        result,restored=self.restore([self.a+'..main'])
        self.assertNotEqual(result.returncode,0)
        self.assertIsNone(restored)

    def test_reachable_F_does_not_replace_missing_working_branch(self):
        result,restored=self.restore(['main'])
        self.assertEqual(result.returncode,0)
        self.assertEqual(git(restored,'cat-file','-t',self.f),'commit')
        self.assertNotEqual(git(restored,'show-ref','--verify','refs/heads/seconds',check=False).returncode,0)

    def test_changed_measurements_and_lost_increase_are_distinguishable(self):
        (self.work/'measurements.tsv').write_bytes(MEASUREMENTS.replace(b'28',b'29'))
        (self.work/'criteria.txt').write_text('latency_limit = 0.025 s\n')
        self.commit('Изменены измерения и потеряно увеличение')
        result,restored=self.restore(['--all'])
        self.assertEqual(result.returncode,0)
        self.assertNotEqual((restored/'measurements.tsv').read_bytes(),MEASUREMENTS)
        self.assertNotEqual((restored/'criteria.txt').read_text(),'latency_limit = 0.030 s\n')

if __name__=='__main__':unittest.main()
