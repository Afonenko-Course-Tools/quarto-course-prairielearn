import {join,resolve} from 'node:path';
import {hash,safePath} from './source-selection.ts';
/** Read the existing Core inventory; never assemble common or teacher files. */
export async function readMaterializedStudent(root:string,book:string,project:string,receipt:any):Promise<{name:string;bytes:Uint8Array}[]>{
 const fail=():never=>{throw Error('PL.STUDENT_ARTIFACT_INVALID: требуется точный Core student inventory данного private snapshot')};
 if(!safePath(book)||!safePath(project)||receipt?.schema!=='pl-private-source-v1'||receipt.privateStage?.path!==root||receipt.publicBase?.book!==book||!Array.isArray(receipt.materialization?.files)||!receipt.files)fail();
 if(await Deno.realPath(root)!==resolve(root))fail();
 const prefix=project+'/student/',seen=new Set<string>(),files=[];
 for(const file of receipt.materialization.files){
  if(typeof file.target!=='string'||!safePath(file.target))fail();
  if(!file.target.startsWith(prefix))continue;
  const name:string=file.target.slice(prefix.length);
  if(!safePath(name)||seen.has(name)||!['public','common'].includes(file.origin)||receipt.files[book+'/'+file.target]!==file.sha256||!/^[a-f0-9]{64}$/.test(file.sha256))fail();
  if(!name.split('/').includes('.git')&&name.split('/').some(part=>['private','reference','solution','solutions','grading-notes','rubric.md','contract.md'].includes(part)))fail();
  let path=root;for(const part of (book+'/'+file.target).split('/')){path=join(path,part);if((await Deno.lstat(path)).isSymlink)fail()}
  if(!(await Deno.lstat(path)).isFile)fail();
  const bytes=await Deno.readFile(path);if(await hash(bytes)!==file.sha256)fail();
  seen.add(name);files.push({name,bytes});
 }
 if(!files.length)fail();
 return files.sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
}
