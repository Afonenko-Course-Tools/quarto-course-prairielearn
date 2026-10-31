"""Обычный Core/A1 fixture -> настоящий Platform host; не assignment/OCI qualification."""
import hashlib,json,shutil,sys,time,zipfile
from pathlib import Path
start=time.monotonic();data=json.loads(Path(sys.argv[1]).read_text());platform=Path(sys.argv[2]);sys.path[:0]=[str(platform/"tools"),str(platform/"tests")]
import grading_job as jobs
from gradle_unit_fixtures import registry
root=Path(data["root"]);out=Path(data["artifactOut"]);manifest=json.loads((out/"checks.json").read_text());projects=jobs.inventory(manifest);assert len(projects)==1
with zipfile.ZipFile(out/"student.zip") as z:
 names=z.namelist();assert names==["README.md","src/main/java/Main.java"]
 readme=z.read("README.md").decode();assert "Позднее настоящее условие"in readme and "fixture-book"in readme
results=[];bindings={};expectations={};required=jobs.scenario_inventory(manifest,root.parent)
for scenario,score in [("starter",0),("reference:lawful",1)]:
 job=jobs.prepare_job(manifest,root.parent,"native/exr-p",scenario,registry=registry())
 try:
  result=jobs.run_job(job,"host",registry());assert result["score"]==score
  for key in ["sourceHashes","testsHashes","nativeSelectionScopeHash"]:assert result[key]==job[key]
  bindings[(job["qualifiedId"],scenario)]={**{k:job[k] for k in ["sourceHashes","testsHashes"]},"jobSchemaVersion":2,"nativeSelectionScopeHash":job["nativeSelectionScopeHash"]}
  expectations[job["qualifiedId"]+":"+scenario]={"job":"complete","score":{"exactly":score}};results.append(result)
 finally:shutil.rmtree(job.root)
receipt=jobs.verify_results(results,expectations,required,[],registry(),bindings);assert receipt["status"]=="success" and receipt["coverage"]=="complete"
report={"kind":"ordinary-native-A1-ZIP-and-Platform-host-separate-pipelines-NOT-assignment-OCI-release","scope":"one-explicit-fixture-project","zipFiles":names,"artifactHashes":{f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in [out/"checks.json",out/"student.zip",out/"condition.html"]},"results":results,"receipt":receipt,"elapsedSeconds":time.monotonic()-start,"CoreMetrics":data["checks"][-2] if len(data["checks"])>2 else data["checks"][-1]};print(json.dumps(report,ensure_ascii=False,indent=2))
