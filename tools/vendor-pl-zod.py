"""Поставка локального ESM Zod из tarball, закреплённого exact lock."""

import base64
import hashlib
import json
from pathlib import Path
import sys
import tarfile

root = Path(__file__).resolve().parents[1] / "_extensions/course-prairielearn"
lock: object = json.loads((root / "package-lock.json").read_text())
match lock:
    case {"packages": {"node_modules/zod": {"integrity": str(expected)}}}:
        pass
    case _:
        raise SystemExit("Exact lock не содержит integrity Zod")
tarball = Path(sys.argv[1])
actual = (
    "sha512-" + base64.b64encode(hashlib.sha512(tarball.read_bytes()).digest()).decode()
)
if actual != expected:
    raise SystemExit("Tarball не соответствует exact lock")
with tarfile.open(tarball) as archive:
    for member in archive.getmembers():
        name = member.name.removeprefix("package/")
        if name in {"LICENSE", "package.json"} or (
            name.startswith("v4/") and (name.endswith(".js") or name.endswith(".d.ts"))
        ):
            if not member.isfile() or ".." in Path(name).parts:
                raise SystemExit("Недопустимый tarball entry")
            target = root / "vendor/zod" / name
            target.parent.mkdir(parents=True, exist_ok=True)
            stream = archive.extractfile(member)
            if stream is None:
                raise SystemExit("Tarball entry не содержит обычного файла")
            with stream:
                data = stream.read()
            if name.endswith(".d.ts"):
                data = data.replace(b'.js"', b'.d.ts"')
            target.write_bytes(data)
print("PASS zod@4.6.7: exact integrity и локальные ESM/типы")
