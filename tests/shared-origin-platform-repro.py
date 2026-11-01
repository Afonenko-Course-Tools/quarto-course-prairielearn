"""Структурный repro exact581 reader; не A1/assignment/OCI qualification."""
import ast
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
java, platform = map(Path, sys.argv[1:3])
for root, expected in [(java, "399a80420878851424b3ecc720b5ac3e88afc2b5"), (platform, "581cc17fc22dc974c8a300c14f5d12fb7c0b3621")]:
    assert subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip() == expected
    assert not subprocess.check_output(["git", "status", "--porcelain"], cwd=root)
sha = lambda b: hashlib.sha256(b).hexdigest()
project = java / "tasks/projects/numbers/quadratic-roots"
source = java / "tasks/projects/common/java/api-support/src/api/java/org/prairielearn/api/PlatformApiPrecheck.java"
relative = os.path.relpath(source, project)
code = (platform / "tools/grading_job.py").read_text()
nodes = [n for n in ast.parse(code).body if isinstance(n, (ast.FunctionDef, ast.ClassDef)) and n.name in ["JobError", "safe", "_selection"]]
namespace = {"Path": Path, "hashlib": hashlib}
exec(compile(ast.Module(body=nodes, type_ignores=[]), str(platform / "tools/grading_job.py"), "exec"), namespace)
error = ""
try:
    namespace["_selection"](project, [{"projectRelativePath": relative, "submissionRelativePath": "src/api/java/org/prairielearn/api/PlatformApiPrecheck.java", "sha256": sha(source.read_bytes())}])
except namespace["JobError"] as exc:
    error = str(exc)
assert error.startswith("Unsafe relative path:")
local = project / "starter/src/main/java/Main.java"
selected = namespace["_selection"](project, [{"projectRelativePath": str(local.relative_to(project)), "submissionRelativePath": "Main.java", "sha256": sha(local.read_bytes())}])
assert len(selected) == 1
print(json.dumps({"status": "EXACT581_STRUCTURAL_READER_ONLY_NOT_NATIVE_AUTHORITY", "source": str(source.relative_to(java / "tasks")), "sourceSha256": sha(source.read_bytes()), "legacyPath": relative, "readerSha256": sha(code.encode()), "actualRefusal": error, "projectLocalPositive": selected, "inspectCalls": 0, "fullWalks": 0, "renders": 0}, indent=2))
