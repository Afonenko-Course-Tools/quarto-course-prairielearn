import {readMaterializedStudent} from '../_extensions/course-prairielearn/application/materialized-student.ts';
import {hash} from '../_extensions/course-prairielearn/application/source-selection.ts';
const assert=(v:unknown,m:string)=>{if(!v)throw Error(m)};
Deno.test('native publisher читает только точный Core student inventory и hashes приватного snapshot',async()=>{
 const root=await Deno.makeTempDir();
 try{
  const target='projects/demo/student/README.md',path=root+'/tasks/'+target;await Deno.mkdir(path.slice(0,path.lastIndexOf('/')),{recursive:true});await Deno.writeTextFile(path,'PUBLIC');
  const receipt={schema:'pl-private-source-v1',privateStage:{path:root},publicBase:{book:'tasks'},files:{['tasks/'+target]:await hash('PUBLIC')},materialization:{files:[{target,sha256:await hash('PUBLIC'),origin:'public'}]}};
  const files=await readMaterializedStudent(root,'tasks','projects/demo',receipt);assert(files.length===1&&files[0].name==='README.md'&&new TextDecoder().decode(files[0].bytes)==='PUBLIC','Exact student files lost');
  for(const change of [()=>{receipt.privateStage.path=root+'/foreign'},()=>{receipt.publicBase.book='foreign'},()=>{receipt.materialization.files[0].origin='teacher'},()=>{receipt.materialization.files[0].sha256='0'.repeat(64)},()=>{receipt.materialization.files[0].target='projects/other/student/README.md'}]){
   const saved=structuredClone(receipt);change();let rejected=false;try{await readMaterializedStudent(root,'tasks','projects/demo',receipt)}catch{rejected=true}assert(rejected,'Foreign/closed/tampered inventory accepted');Object.assign(receipt,saved);
  }
  await Deno.writeTextFile(path,'DRIFT');let rejected=false;try{await readMaterializedStudent(root,'tasks','projects/demo',receipt)}catch{rejected=true}assert(rejected,'Modified bytes accepted');
 }finally{await Deno.remove(root,{recursive:true})}
});
