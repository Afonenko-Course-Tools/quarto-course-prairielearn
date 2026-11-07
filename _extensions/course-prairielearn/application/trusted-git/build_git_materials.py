from collections.abc import Mapping
from typing import TypedDict
from pathlib import Path, PurePosixPath
import os
import shutil
import subprocess
from system_support import safe_archive_name


class GitState(TypedDict):
    refs: list[str]
    head: str
    status: str


def target(root: Path, relative: str) -> Path:
    safe_archive_name(relative)
    current = root
    parts = PurePosixPath(relative).parts
    for index, component in enumerate(parts):
        current = current / component
        if current.is_symlink() or (current.exists() and index < len(parts) - 1 and not current.is_dir()):
            raise ValueError(f'Небезопасный путь: {relative}')
    if current.exists() and not current.is_file():
        raise ValueError(f'Ожидался обычный файл: {relative}')
    return current


def git_env() -> dict[str, str]:
    env={k:v for k,v in os.environ.items() if not k.startswith('GIT_')}
    env.update(GIT_CONFIG_GLOBAL='/dev/null',GIT_CONFIG_NOSYSTEM='1',GIT_CONFIG_COUNT='0',GIT_OPTIONAL_LOCKS='0',GIT_INDEX_VERSION='2',GIT_AUTHOR_NAME='Учебный набор',GIT_AUTHOR_EMAIL='course-fixture@example.invalid',GIT_COMMITTER_NAME='Учебный набор',GIT_COMMITTER_EMAIL='course-fixture@example.invalid',GIT_AUTHOR_DATE='2026-10-16T00:00:00Z',GIT_COMMITTER_DATE='2026-10-16T00:00:00Z',LC_ALL='C.UTF-8',TZ='UTC')
    return env


def git(repo: Path, *args: str, input: bytes | None = None) -> bytes:
    run=subprocess.run(['git','--no-optional-locks',*args],cwd=repo,env=git_env(),input=input,capture_output=True,timeout=15)
    if run.returncode:raise ValueError('Git seed: '+run.stderr.decode('utf-8',errors='replace'))
    return run.stdout


def put(repo: Path, files: Mapping[str, str]) -> None:
    for name,text in files.items():
        p=target(repo,name);p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(text.encode('utf-8'))


def commit(repo: Path, files: Mapping[str, str], message: str) -> str:
    put(repo,files);git(repo,'add','--all');git(repo,'-c','commit.gpgsign=false','commit','-qm',message)
    return git(repo,'rev-parse','HEAD').decode().strip()


def initialize(repo: Path, template: Path) -> None:
    repo.mkdir();git(repo,'init','-q','--initial-branch=main','--object-format=sha1','--template='+str(template))
    git(repo,'config','--local','core.filemode','false');git(repo,'config','--local','core.autocrlf','false');git(repo,'config','--local','core.logAllRefUpdates','false')


def normalize(repo: Path) -> GitState:
    entries=git(repo,'ls-files','--stage','-z');(repo/'.git/index').unlink();git(repo,'update-index','-z','--index-info',input=entries)
    for name in ['COMMIT_EDITMSG','ORIG_HEAD','description']:
        (repo/'.git'/name).unlink(missing_ok=True)
    shutil.rmtree(repo/'.git/logs',ignore_errors=True)
    return {'refs':git(repo,'show-ref').decode().splitlines(),'head':git(repo,'symbolic-ref','HEAD').decode().strip(),'status':git(repo,'status','--porcelain=v1').decode()}
