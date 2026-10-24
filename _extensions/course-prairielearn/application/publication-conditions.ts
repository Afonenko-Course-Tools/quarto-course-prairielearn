/** Whole ZIP принятой публикации: отдельная зависимость, не Core/student artifact. */
import {basename,join,resolve} from 'node:path';
import {canonical,hash,safePath} from './source-selection.ts';
const fail=(message:string):never=>{throw Error('PL publication conditions: '+message)};
const closed=(v:any,keys:string[])=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const hex=(v:any)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const repository=(v:any)=>typeof v==='string'&&/^https:\/\/[^/@\s]+\/[^\s]+$/.test(v);
const commit=(v:any)=>typeof v==='string'&&/^[a-f0-9]{40}$/.test(v);
export type PublicationCondition={target:string;data:Uint8Array};
function requests(exercises:any[]){
 const found=new Map<string,string>();
 for(const exercise of exercises){
  if(!/^exr-[a-z0-9][a-z0-9-]*$/.test(exercise.id)||!safePath(exercise.source))fail('Неверный selected question/source');
  const walk=(node:any)=>{
   if(Array.isArray(node)){for(const child of node)walk(child);return}
   if(!node||typeof node!=='object')return;
   if(node.t==='Link'&&node.c?.[0]?.[1]?.some((c:string)=>['project-download','project-download-link'].includes(c))){
    const target=node.c?.[2]?.[0];
    if(typeof target==='string'&&target.endsWith('-conditions.zip')){
     if(!/^(?:\.\.\/)*_downloads\/exr-[a-z0-9][a-z0-9-]*-conditions\.zip$/.test(target)||basename(target)!==exercise.id+'-conditions.zip')fail('Foreign conditions request');
     if(found.has(exercise.id)&&found.get(exercise.id)!==exercise.source)fail('Неоднозначный request source');
     found.set(exercise.id,exercise.source);
    }
   }
   for(const value of Object.values(node))walk(value);
  };
  walk(exercise.body);
 }
 return found;
}
export function publicationConditionFile(id:string,artifact?:PublicationCondition){
 if(artifact===undefined)return;
 if(!/^exr-[a-z0-9][a-z0-9-]*$/.test(id)||artifact.target!==id+'-conditions.zip'||!(artifact.data instanceof Uint8Array)||!artifact.data.length)fail('Небезопасный client target/bytes');
 return {file:{name:artifact.target,data:artifact.data},html:'<p><a href="{{options.client_files_question_url}}/'+encodeURIComponent(artifact.target)+'">Скачать условие для локального просмотра</a></p>'};
}
export async function loadPublicationConditions(path:string,context:{courseId:string;projectRoot:string;source:{repository:string;commit:string;book:string};exercises:any[]}){
 const snapshots=new Map<string,{data:Uint8Array;sha256:string;identity:string}>();let total=0;
 const identity=(s:Deno.FileInfo)=>canonical([s.dev,s.ino,s.mode,s.size,s.mtime?.getTime(),s.ctime?.getTime(),s.nlink]);
 const read=async(name:string,typed?:any)=>{
  if(typeof name!=='string'||resolve(name)!==name||await Deno.realPath(name)!==name)fail('Требуется ordinary absolute input path');
  let value=snapshots.get(name);
  if(!value){
   const before=await Deno.lstat(name);if(!before.isFile||before.isSymlink||before.nlink!==1)fail('Ссылка/особый input');
   total+=before.size;if(total>256*1024**2)fail('Input bytes cap');
   const data=await Deno.readFile(name);if(identity(before)!==identity(await Deno.lstat(name)))fail('Input изменён при чтении');
   value={data,sha256:await hash(data),identity:identity(before)};snapshots.set(name,value);
  }
  if(typed&&(!closed(typed,['path','bytes','sha256'])||typed.path!==name||!Number.isSafeInteger(typed.bytes)||typed.bytes<1||!hex(typed.sha256)||typed.bytes!==value.data.length||typed.sha256!==value.sha256))fail('Input bytes/hash не совпадают');
  return value;
 };
 const manifest=await read(path);if(manifest.data.length>2*1024**2)fail('Manifest bytes cap');
 const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(manifest.data));
 if(!closed(value,['schema','courseId','source','publication','archives'])||value.schema!=='pl-publication-conditions-v1'||value.courseId!==context.courseId||!closed(value.source,['repository','commit','book'])||!repository(value.source.repository)||!commit(value.source.commit)||!safePath(value.source.book)||canonical(value.source)!==canonical(context.source))fail('Чужой course/source authority');
 if(!closed(value.publication,['repository','commit','receipt'])||value.publication.repository!==value.source.repository||!commit(value.publication.commit)||!Array.isArray(value.archives))fail('Нет historical publication authority');
 await read(value.publication.receipt?.path,value.publication.receipt);
 const wanted=requests(context.exercises),artifacts=new Map<string,PublicationCondition>(),zipPaths=new Set<string>(),summary=[];
 for(const row of value.archives){
  if(!closed(row,['questionId','source','sourceSha256','file'])||typeof row.questionId!=='string'||wanted.get(row.questionId)!==row.source||artifacts.has(row.questionId)||!safePath(row.source)||!hex(row.sourceSha256))fail('Missing/duplicate/foreign question/source');
  const sourcePath=join(context.projectRoot,row.source);if(zipPaths.has(sourcePath))fail('Archive/source alias');
  const source=await read(sourcePath);if(source.sha256!==row.sourceSha256)fail('Current question source hash изменён');
  if(!row.file||zipPaths.has(row.file.path)||snapshots.has(row.file.path))fail('Неоднозначный archive input');zipPaths.add(row.file.path);
  const archive=await read(row.file.path,row.file);if(archive.data[0]!==0x50||archive.data[1]!==0x4b)fail('Не ZIP input');
  const target=row.questionId+'-conditions.zip';artifacts.set(row.questionId,{target,data:archive.data.slice()});
  summary.push({questionId:row.questionId,source:row.source,sourceSha256:row.sourceSha256,target,bytes:row.file.bytes,sha256:row.file.sha256});
 }
 if(artifacts.size!==wanted.size)fail('Отсутствует requested conditions archive');
 const check=async()=>{
  for(const [name,before] of snapshots){
   if(await Deno.realPath(name)!==name)fail('Input path drift');const s=await Deno.lstat(name);
   if(!s.isFile||s.isSymlink||s.nlink!==1||identity(s)!==before.identity)fail('Input identity drift');
   const bytes=await Deno.readFile(name);if(await hash(bytes)!==before.sha256||identity(await Deno.lstat(name))!==before.identity)fail('Input bytes/identity drift');
  }
 };
 await check();
 return {artifacts,check,provenance:{manifestSha256:manifest.sha256,courseId:value.courseId,source:value.source,publication:{repository:value.publication.repository,commit:value.publication.commit,receipt:{bytes:value.publication.receipt.bytes,sha256:value.publication.receipt.sha256}},archives:summary.sort((a,b)=>a.questionId.localeCompare(b.questionId))}};
}
