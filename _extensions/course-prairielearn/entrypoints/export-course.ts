import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { exportCourse } from "../application/export-course.ts";
import { declarations } from "../application/declarations.ts";
import {readMaterializedStudent} from '../application/materialized-student.ts';
const args = Deno.args[0] === "--" ? Deno.args.slice(1) : Deno.args;
const [rootArg, output, ...options] = args;
const flags: Record<string, string> = {};
for (let i = 0; i < options.length; i += 2) {
  if (
    ![
      "--instance",
      "--checks-output",
      "--runtime-registry",
      "--book",
      "--candidate-image",
      "--staging-receipt",
      "--publication-conditions",
    ].includes(options[i]) || !options[i + 1] || flags[options[i]]
  ) throw new Error("PL unknown or duplicate CLI option");
  flags[options[i]] = options[i + 1];
}
const publicationEnvironment=Deno.env.get("PRAIRIELEARN_PUBLICATION_CONDITIONS");
if(flags["--publication-conditions"]!==undefined&&publicationEnvironment!==undefined)throw Error("PL ambiguous publication conditions input: CLI and ENV");
const publicationConditions=flags["--publication-conditions"]??publicationEnvironment;
if(publicationConditions!==undefined&&!isAbsolute(publicationConditions))throw Error("PL publication conditions absolute path required");
if (!rootArg || !output || !flags["--instance"] || !flags["--checks-output"]) {
  throw new Error(
    "Usage: export-course.ts COURSE_ROOT NATIVE --instance KEY --checks-output PATH [--runtime-registry PATH] [--book tasks]",
  );
}
const root = await Deno.realPath(rootArg), book = flags["--book"] ?? "tasks";
const registryPath = flags["--runtime-registry"] ??
  Deno.env.get("PRAIRIELEARN_RUNTIME_REGISTRY") ??
  join(root, "prairielearn/runtime-profiles.json");
if (flags["--candidate-image"]) {
  const found = await new Deno.Command("docker", {
    args: [
      "image",
      "inspect",
      flags["--candidate-image"],
      "--format",
      "{{.Id}}",
    ],
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (
    !found.success ||
    new TextDecoder().decode(found.stdout).trim() !== flags["--candidate-image"]
  ) throw new Error("PL candidate must be an actual locally built image ID");
}
const inspected = await new Deno.Command(Deno.env.get("QUARTO") ?? "quarto", {
  args: ["inspect", resolve(root, book)],
  stdout: "piped",
  stderr: "piped",
}).output();
if (!inspected.success) {
  throw new Error(new TextDecoder().decode(inspected.stderr));
}
const config =
  JSON.parse(new TextDecoder().decode(inspected.stdout)).config.prairielearn;
const delivery = declarations(config, flags["--instance"]);
if (delivery.book !== book) throw new Error("PL delivery book mismatch");
let core: string | undefined;
for (
  const path of [
    join(root, book, "_extensions/course-core"),
    join(root, book, "_extensions/Afonenko-Course-Tools/course-core"),
  ]
) {
  try {
    if ((await Deno.stat(path)).isDirectory) {
      core = path;
      break;
    }
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
  }
}
if (!core) throw new Error("PL installed Core required");
const { collectNativeModel } = await import(
  pathToFileURL(join(core, "body-export/collect.ts")).href
);
const { collectProjectChecks } = await import(
  pathToFileURL(join(core, "project-checks/collect.ts")).href
);
const { buildBodies } = await import(
  pathToFileURL(join(core, "body-export/producer.ts")).href
);
const collected = await collectNativeModel(root, { book });
const checks = await collectProjectChecks(root, { book }, collected);
let studentArtifact:undefined|((fact:any)=>Promise<{files:{name:string;bytes:Uint8Array}[];archive:Uint8Array}>);
let receipt:any;
if(flags['--staging-receipt']){
  receipt=JSON.parse(await Deno.readTextFile(flags['--staging-receipt']));
  let download:string|undefined;
  for(const path of [join(root,book,'_extensions/project-download/domain/zip.ts'),join(root,book,'_extensions/Afonenko-Course-Tools/project-download/domain/zip.ts')]){
    try{if((await Deno.lstat(path)).isFile){download=path;break}}catch(error){if(!(error instanceof Deno.errors.NotFound))throw error}
  }
  if(!download)throw Error('PL private export требует установленный Download ZIP API');
  const {zip}=await import(pathToFileURL(download).href);
  studentArtifact=async(fact:any)=>{const files=await readMaterializedStudent(root,book,fact.projectRoot,receipt);return {files,archive:zip(files)}};
}
let publicationSource:any;
if(publicationConditions){
  if(receipt)publicationSource=receipt.publicBase;
  else{
    const git=async(args:string[])=>{const p=await new Deno.Command('git',{args:['-C',root,...args],stdout:'piped',stderr:'piped'}).output();if(!p.success)throw Error('PL publication source Git authority required');return new TextDecoder().decode(p.stdout).trim()};
    publicationSource={repository:await git(['remote','get-url','origin']),commit:await git(['rev-parse','HEAD']),book};
  }
}
await exportCourse({
  courseId: collected.courseId,
  projectRoot: collected.projectRoot,
  result: collected.result,
  checks,
  config,
  registry: JSON.parse(await Deno.readTextFile(registryPath)),
  instance: flags["--instance"],
  output,
  checksOutput: flags["--checks-output"],
  candidateImage: flags["--candidate-image"],
  publicationConditions: publicationConditions,
  publicationSource,
  studentArtifact,
  body: async (work: string) =>
    (await buildBodies(collected.result, {
      projectRoot: collected.projectRoot,
      courseId: collected.courseId,
      work,
      bodyReferences: collected.bodyReferences,
      includeClosed: true,
    })).publicPackage,
});
