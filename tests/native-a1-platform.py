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
parity={}
if len(sys.argv)>3:
 baseline=Path(sys.argv[3]);old=json.loads((baseline/"c4-joint-fixture-checks.json").read_text())
 parity["legacyHashAreas"]={key:old[key]==manifest[key] for key in ("sourceSnapshotHash","inventoryHash")};assert all(parity["legacyHashAreas"].values())
 assert old["projects"]==manifest["projects"];parity["normalizedProjectsExact"]=True
 with zipfile.ZipFile(baseline/"c4-joint-fixture-student.zip")as before,zipfile.ZipFile(out/"student.zip")as after:
  assert before.namelist()==after.namelist();parity["ZIPEntryBytesExact"]={name:before.read(name)==after.read(name) for name in before.namelist()};assert all(parity["ZIPEntryBytesExact"].values())
 assert jobs.digest(required)==data["checks"][0]["verification"]["scenariosHash"];parity["scenarioOrderAndHashExact"]=True
 # Fresh actual C project sources against the unchanged strict v3 value reader.
 import uuid,copy
 from delivery_verification import classification
 q="native/exr-p";p=projects[0]
 binding={"uuid":str(uuid.uuid5(uuid.NAMESPACE_URL,q)),"grading":{"method":"external"},"submission":{"mode":"upload"},"sourceRoot":p["projectRoot"],"projectCheck":p["check"]["profile"],"runtime":p["check"]["runtime"],"sources":p["sources"]}
 value={"schemaVersion":3,"courseId":"native","bookRoot":manifest["bookRoot"],"sourceSnapshotHash":manifest["sourceSnapshotHash"],"inventoryHash":manifest["inventoryHash"],"verificationInventoryHash":jobs.digest(required),"questions":[q],"gradingPayloads":{q:binding},"works":[{"id":"sec-work"}],"instances":{"fixture":{}},"files":{"infoCourse.json":"a"*64},"deliveryHash":"b"*64}
 assert classification(value)=={q:"external"};refused=0
 for mutate in [lambda row:row.update(ownerRelativePath="shared/foreign.java"),lambda row:row.pop("sha256"),lambda row:row.update(extra=True)]:
  bad=copy.deepcopy(value);mutate(bad["gradingPayloads"][q]["sources"][0])
  try:classification(bad)
  except jobs.JobError:refused+=1
 assert refused==3;parity["strict3ClassificationValueOnlyNotPackage"]={"acceptedActualProjectSources":True,"tamperRefusals":refused,"publicSourcesFields":[sorted(row)for row in p["sources"]]}
report={"parity":parity,"kind":"ordinary-native-A1-ZIP-and-Platform-host-separate-pipelines-NOT-assignment-OCI-release","scope":"one-explicit-fixture-project","zipFiles":names,"artifactHashes":{f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in [out/"checks.json",out/"student.zip",out/"condition.html"]},"results":results,"receipt":receipt,"elapsedSeconds":time.monotonic()-start,"CoreMetrics":next(row["operationMetrics"] for row in data["checks"] if "operationMetrics" in row)};print(json.dumps(report,ensure_ascii=False,indent=2))
