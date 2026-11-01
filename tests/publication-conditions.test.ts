// File/AST/producer unit fixtures; не NativeRun и не native qualification.
import {join} from 'node:path';
import {hash} from '../_extensions/course-prairielearn/application/source-selection.ts';
function assert(v:unknown,m='Проверка не выполнена'):asserts v {if(!v)throw Error(m)}
const rejects=async(f:()=>Promise<unknown>)=>{let rejected=false;try{await f()}catch{rejected=true}assert(rejected,'Небезопасный вход принят')};
const zip=Uint8Array.from(atob('UEsDBBQAAAAAACRtWF2/c6wWXgAAAF4AAAAKAAAAaW5kZXguaHRtbDwhZG9jdHlwZSBodG1sPjx0aXRsZT7Qo9GB0LvQvtCy0LjQtTwvdGl0bGU+PHA+0KHQuNC90YLQtdGC0LjRh9C10YHQutC40Lkg0LrQvtC80L/Qu9C10LrRgjwvcD5QSwECFAMUAAAAAAAkbVhdv3OsFl4AAABeAAAACgAAAAAAAAAAAAAAgAEAAAAAaW5kZXguaHRtbFBLBQYAAAAAAQABADgAAACGAAAAAAA='),c=>c.charCodeAt(0));
const link=(id:string,kind='conditions')=>({t:'Link',c:[['',['project-download'],[['download','']]],[],['_downloads/'+id+'-'+kind+'.zip','']]});
type FixtureExercise={id:string;source:string;body:{blocks:{t:string;c:ReturnType<typeof link>[]}[]}};
async function fixture(){
 const root=await Deno.makeTempDir(),projectRoot=join(root,'tasks');await Deno.mkdir(join(projectRoot,'labs'),{recursive:true});
 const source={repository:'https://example.invalid/course.git',commit:'a'.repeat(40),book:'tasks'},archives=[];
 const exercises:FixtureExercise[]=[];
 const proof=join(root,'accepted-publication.json');await Deno.writeTextFile(proof,'{"fixture":"accepted historical publication"}');
 const typed=async(path:string)=>{const bytes=await Deno.readFile(path);return {path,bytes:bytes.length,sha256:await hash(bytes)}};
 for(let n=0;n<7;n++){
  const id='exr-fixture-'+n,sourcePath='labs/fixture-'+n+'.qmd';await Deno.writeTextFile(join(projectRoot,sourcePath),'# Синтетическое условие '+n);
  exercises.push({id,source:sourcePath,body:{blocks:[{t:'Para',c:[link(id)]}]}});
  const path=join(root,id+'.zip');await Deno.writeFile(path,zip);
  archives.push({questionId:id,source:sourcePath,sourceSha256:await hash(await Deno.readFile(join(projectRoot,sourcePath))),file:await typed(path)});
 }
 const manifest={schema:'pl-publication-conditions-v1',courseId:'demo',source:{...source},publication:{repository:source.repository,commit:'b'.repeat(40),receipt:await typed(proof)},archives};
 const path=join(root,'conditions.json');const save=()=>Deno.writeTextFile(path,JSON.stringify(manifest));await save();
 const load=async()=>{const api=await import('../_extensions/course-prairielearn/application/publication-conditions.ts');return await api.loadPublicationConditions(path,{courseId:'demo',projectRoot,source,exercises})};
 return {root,projectRoot,source,exercises,manifest,path,save,load};
}
Deno.test('семь whole ZIP и normal client links; без зависимости presentation отсутствует',async()=>{
 const f=await fixture();try{const deps=await f.load();const {publicationConditionFile}=await import('../_extensions/course-prairielearn/application/publication-conditions.ts');assert(deps.artifacts.size===7);
  for(const e of f.exercises){const value=publicationConditionFile(e.id,deps.artifacts.get(e.id));assert(value!==undefined);assert(value.file.name===e.id+'-conditions.zip');assert(await hash(value.file.data)===await hash(zip));assert(value.html.includes('{{options.client_files_question_url}}/'+e.id+'-conditions.zip')&&value.html.includes('Скачать условие для локального просмотра'));assert(!value.html.includes(f.root));assert(publicationConditionFile(e.id,undefined)===undefined);}
  assert(deps.provenance.manifestSha256===await hash(await Deno.readFile(f.path)));assert(!JSON.stringify(deps.provenance).includes(f.root));await deps.check();
 }finally{await Deno.remove(f.root,{recursive:true})}
});
Deno.test('missing/duplicate/foreign/source/hash manifests отвергаются',async()=>{
 const changes=[(f:any)=>f.manifest.archives.pop(),(f:any)=>f.manifest.archives.push(f.manifest.archives[0]),(f:any)=>f.manifest.archives[0].questionId='exr-foreign',(f:any)=>f.manifest.courseId='foreign',(f:any)=>f.manifest.source.commit='c'.repeat(40),(f:any)=>f.manifest.archives[0].source='labs/foreign.qmd',(f:any)=>f.manifest.archives[0].file.sha256='0'.repeat(64),(f:any)=>f.manifest.archives[0].sourceSha256='0'.repeat(64)];
 for(const change of changes){const f=await fixture();try{change(f);await f.save();await rejects(f.load)}finally{await Deno.remove(f.root,{recursive:true})}}
});
Deno.test('unsafe/symlink/hardlink/alias publication inputs отвергаются',async()=>{
 for(const kind of ['missing','symlink','parent-symlink','hardlink','alias','unsafe-source']){const f=await fixture();try{
  const first=f.manifest.archives[0];if(kind==='missing')await Deno.remove(first.file.path);else if(kind==='symlink'){const target=first.file.path;first.file.path=join(f.root,'link.zip');await Deno.symlink(target,first.file.path)}else if(kind==='parent-symlink'){await Deno.symlink(f.root,join(f.root,'linked'));first.file.path=join(f.root,'linked',first.questionId+'.zip')}else if(kind==='hardlink')await Deno.link(first.file.path,join(f.root,'alias.zip'));else if(kind==='alias')f.manifest.archives[1].file={...first.file};else first.source='../outside.qmd';await f.save();await rejects(f.load);
 }finally{await Deno.remove(f.root,{recursive:true})}}
});
Deno.test('все requested conditions из genuine-model AST обязательны; starter не заимствует ZIP',async()=>{
 const f=await fixture();try{f.exercises[0].body.blocks=[{t:'Para',c:[link(f.exercises[0].id,'starter')]}];await rejects(f.load)}finally{await Deno.remove(f.root,{recursive:true})}
});
Deno.test('дрейф manifest/archive/source/provenance после pre-boundary отвергается',async()=>{
 for(const kind of ['manifest','archive','source','provenance']){const f=await fixture();try{const deps=await f.load();const path=kind==='manifest'?f.path:kind==='archive'?f.manifest.archives[0].file.path:kind==='source'?join(f.projectRoot,f.exercises[0].source):f.manifest.publication.receipt.path;await Deno.writeTextFile(path,'DRIFT');await rejects(()=>deps.check())}finally{await Deno.remove(f.root,{recursive:true})}}
});
Deno.test('presentation отказывает unsafe/foreign target вместо произвольного client resource',async()=>{const {publicationConditionFile}=await import('../_extensions/course-prairielearn/application/publication-conditions.ts');for(const target of ['../escape.zip','foreign.zip','starter.zip','exr-a-conditions.zip?x'])await rejects(async()=>publicationConditionFile('exr-a',{target,data:zip}));});
Deno.test('real CLI и wholecourse consumer имеют явную зависимость до delivery hash',async()=>{
 const entry=await Deno.readTextFile(new URL('../_extensions/course-prairielearn/entrypoints/export-course.ts',import.meta.url));const consumer=await Deno.readTextFile(new URL('../_extensions/course-prairielearn/application/export-course.ts',import.meta.url));assert(entry.includes('"--publication-conditions"')&&entry.includes('publicationConditions:'));const producer=await Deno.readTextFile(new URL('../_extensions/course-prairielearn/application/export.ts',import.meta.url));assert(producer.includes('publicationConditionFile')&&producer.includes('presented.file.data')&&producer.includes('presented.html'),'Real presentation wiring отсутствует');assert(consumer.includes('loadPublicationConditions')&&consumer.includes('publicationConditions:')&&consumer.includes('publicationConditions.provenance')&&consumer.includes('publicationConditions.check()'),'CLI/consumer forwarding или authority отсутствует');
});
