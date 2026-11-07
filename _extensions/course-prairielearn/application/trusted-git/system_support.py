from collections.abc import Mapping
from typing import TypeGuard
from pathlib import Path, PurePosixPath
import json


class ArchiveError(ValueError):
    pass


def safe_archive_name(name: str) -> str:
    path = PurePosixPath(name)
    if (not name or '\0' in name or not path.parts or '\\' in name or ':' in name or path.is_absolute()
            or '..' in path.parts or name.rstrip('/') != path.as_posix()):
        raise ArchiveError(f'Недопустимое имя в архиве: {name!r}')
    return path.as_posix()


def read_json(path: Path) -> object:
    return json.loads(path.read_text())


def _object_container(value: object) -> TypeGuard[Mapping[object, object]]:
    return isinstance(value, dict)


def json_object(value: object) -> dict[str, object]:
    if not _object_container(value):
        raise ValueError('JSON: ожидался объект')
    result: dict[str, object] = {}
    for key, item in value.items():
        if not isinstance(key, str):
            raise ValueError('JSON: ожидался строковый ключ')
        result[key] = item
    return result


def json_string(value: object) -> str:
    if not isinstance(value, str):
        raise ValueError('JSON: ожидалась строка')
    return value


def json_texts(value: object) -> dict[str, str]:
    return {key: json_string(item) for key, item in json_object(value).items()}
