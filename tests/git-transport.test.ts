// Синтетический export unit: настоящий Git/ZIP/Pandoc, без NativeRun и рендера курса.
import {exportPrairieLearn} from '../_extensions/course-prairielearn/application/export.ts';
import {join,relative} from 'node:path';
function assert(value:unknown,message:string):asserts value {if(!value)throw Error(message)}
const decode=(data:Uint8Array)=>new TextDecoder().decode(data);
async function command(cwd:string,program:string,args:string[]){
 const output=await new Deno.Command(program,{cwd,args,stdout:'piped',stderr:'piped',env:{GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_TERMINAL_PROMPT:'0'}}).output();
 assert(output.success,program+' завершился с ошибкой: '+decode(output.stderr));return decode(output.stdout).trim();
}
async function inventory(root:string,prefix=''):Promise<Record<string,string>>{
 const result:Record<string,string>={};
 for await(const entry of Deno.readDir(join(root,prefix))){
  if(!prefix&&entry.name==='.git')continue;
  const name=prefix?prefix+'/'+entry.name:entry.name;
  assert(!entry.isSymlink,'Неожиданная ссылка: '+name);
  if(entry.isDirectory)Object.assign(result,await inventory(root,name));
  else{const data=await Deno.readFile(join(root,name));const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),b=>b.toString(16).padStart(2,'0')).join('');const mode=(await Deno.stat(join(root,name))).mode!&0o777;result[name]=sha+':'+mode.toString(8)}
 }
 return result;
}
const canonical=(v:Record<string,string>)=>JSON.stringify(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)));
Deno.test('Git clone переносит полный native payload, а starter ZIP сохраняет исходную историю',async()=>{
 const root=await Deno.makeTempDir({prefix:'pl-git-transport-'});
 try{
  const student=join(root,'projects/report/student'),repository=join(student,'work');await Deno.mkdir(repository,{recursive:true});
  await Deno.writeTextFile(join(student,'README.md'),'Распакуйте starter.zip и откройте work.');
  await Deno.writeTextFile(join(repository,'notes.txt'),'Исходное состояние\n');
  await command(repository,'git',['init','--initial-branch=main']);
  await command(repository,'git',['add','notes.txt']);
  await command(repository,'git',['-c','user.name=Учебный автор','-c','user.email=fixture@example.invalid','commit','-m','Исходное состояние']);
  const initial=await command(repository,'git',['rev-parse','HEAD']);
  const files:{name:string;bytes:Uint8Array}[]=[];
  async function collect(directory:string){for await(const entry of Deno.readDir(directory)){const path=join(directory,entry.name);if(entry.isDirectory)await collect(path);else files.push({name:relative(student,path).replaceAll('\\','/'),bytes:await Deno.readFile(path)})}}
  await collect(student);
  assert(files.some(f=>f.name.startsWith('work/.git/')),'Fixture не содержит историю');
  const zip=join(root,'starter.zip');
  await command(root,'python3',['-c','import pathlib,sys,zipfile; r=pathlib.Path(sys.argv[1]); z=zipfile.ZipFile(sys.argv[2],"w"); [z.write(p,p.relative_to(r)) for p in sorted(r.rglob("*")) if p.is_file()]; z.close()',student,zip]);
  const archive=await Deno.readFile(zip);
  const pkg={schema:'course-body-package-v2',owner:'synthetic',release:'native',apiVersion:[1,23,1],questions:[{owner:'synthetic',id:'exr-report',key:'synthetic/exr-report',title:'История Git',difficulty:'introductory',source:'report.qmd',visibility:'public',statementVisibility:'open',hasPublicSolution:false,answerType:'manual',condition:[{t:'Para',c:[{t:'Str',c:'Распакуйте комплект.'}]}],publicAnswer:[]}],works:[{owner:'synthetic',id:'sec-report',key:'synthetic/sec-report',source:'report.qmd',kind:'lab',title:'История Git',slots:[{id:'synthetic/sec-report/exr-report',selection:'fixed',candidates:['synthetic/exr-report'],assignment:{requirement:'required',workMode:'individual'}}]}],resources:[]};
  const output=join(root,'native');
  await exportPrairieLearn(pkg,{projectRoot:root,projects:{'exr-report':'/projects/report'},studentArtifacts:{'exr-report':{files,archive}}},{questions:{'exr-report':{topic:'Synthetic',grading:{method:'manual'},submission:{mode:'upload'},files:[]}}},output);
  const intended=await inventory(output);
  await command(output,'git',['init','--initial-branch=main']);await command(output,'git',['add','.']);
  await command(output,'git',['-c','user.name=Учебный автор','-c','user.email=fixture@example.invalid','commit','-m','Native export']);
  const staged=await command(output,'git',['ls-files','--stage']);
  const clone=join(root,'clone');await command(root,'git',['clone','--no-local','--no-hardlinks',output,clone]);
  assert(canonical(await inventory(clone))===canonical(intended),'Обычный Git clone потерял native payload; index:\n'+staged);
  assert(staged.split('\n').every(row=>/^(100644|100755) /.test(row)),'Native index содержит gitlink/особый тип');
  const client=join(clone,'questions/synthetic/exr-report/clientFilesQuestion');
  const copied=await Deno.readFile(join(client,'starter.zip'));
  assert(copied.length===archive.length&&copied.every((v,i)=>v===archive[i]),'Starter ZIP изменён');
  for(const file of files){if(file.name.split('/').includes('.git'))continue;const raw=await Deno.readFile(join(client,'starter',file.name));assert(raw.length===file.bytes.length&&raw.every((v,i)=>v===file.bytes[i]),'Публичный raw файл изменён: '+file.name)}
  const html=await Deno.readTextFile(join(clone,'questions/synthetic/exr-report/question.html'));
  assert(html.includes('{{options.client_files_question_url}}/starter.zip')&&html.includes('{{options.client_files_question_url}}/starter/README.md'),'Ссылки на комплект/README потеряны');
  const extracted=join(root,'extracted');await Deno.mkdir(extracted);
  await command(root,'python3',['-c','import sys,zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])',join(client,'starter.zip'),extracted]);
  assert(await command(join(extracted,'work'),'git',['rev-parse','HEAD'])===initial,'ZIP потерял начальный коммит');
  assert(await command(join(extracted,'work'),'git',['branch','--show-current'])==='main','ZIP потерял ветку');
  assert(await command(join(extracted,'work'),'git',['status','--porcelain'])==='','ZIP потерял чистое исходное состояние');
  assert(await command(join(extracted,'work'),'git',['log','-1','--format=%s'])==='Исходное состояние','ZIP потерял историю');
 }finally{await Deno.remove(root,{recursive:true})}
});
