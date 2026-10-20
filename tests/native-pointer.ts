import {copy} from 'stdlib/fs';
import {dirname,fromFileUrl,join,resolve} from 'stdlib/path';
import {renderNative,verifyInstalled} from './native-render.ts';
const repo=dirname(dirname(fromFileUrl(import.meta.url))),core=resolve(Deno.args[0]??'../core');
const root=await Deno.makeTempDir({prefix:'pl-pointer-v2-'});
const assert=(value:unknown,message:string)=>{if(!value)throw Error(message)};
async function command(args:string[]){const result=await new Deno.Command(Deno.env.get('QUARTO')||'quarto',{args,cwd:root,stdout:'piped',stderr:'piped'}).output();return {ok:result.success,text:new TextDecoder().decode(result.stdout)+new TextDecoder().decode(result.stderr)}}
try{
 await Deno.mkdir(join(root,'_extensions'));
 await copy(join(core,'_extensions/course-core'),join(root,'_extensions/course-core'));
 await copy(join(repo,'_extensions/course-prairielearn'),join(root,'_extensions/course-prairielearn'));
 await verifyInstalled(root,core,'core');await verifyInstalled(root,repo,'prairielearn');
 const config=`project:
  type: default
  render: [index.qmd]
  output-dir: _site
  pre-render: _extensions/course-core/entrypoints/pre.ts
  post-render: _extensions/course-core/entrypoints/post.ts
  resources: ['!projects/**']
format: html
lang: ru
course: {id: pointer-fixture, adapters: [prairielearn]}
filters: [course-core, course-prairielearn]
exercise-bank: true
exercise-statement-visibility: open
default-exercise-project-check: false
prairielearn:
  question-defaults:
    topic: Проверка
    grading: {method: manual}
    submission: {mode: upload}
`;
 await Deno.writeTextFile(join(root,'_quarto.yml'),config);
 await Deno.writeTextFile(join(root,'_quarto-full.yml'),'course: {view: full}\n');
 await Deno.mkdir(join(root,'projects/a/student'),{recursive:true});
 await Deno.writeTextFile(join(root,'projects/a/student/README.md'),'Публичный комплект для ручного наблюдения.\n');
 const authored='# Банк\n\n::: {#exr-pointer difficulty=introductory time=10 target=prairielearn project="/projects/a"}\n## Наблюдение\nПокажите результат преподавателю.\n:::\n';
 await Deno.writeTextFile(join(root,'index.qmd'),authored);
 const positive=await renderNative(root,'full');assert(positive.ok,positive.text);
 const pointer=JSON.parse(await Deno.readTextFile(join(root,'_generated/course-spec/active-native-run.json')));
 assert(pointer.schema==='course-native-run-pointer-v2'&&pointer.commonPathBinding,'Expected fresh Core v2 witness');
 const run=JSON.parse(await Deno.readTextFile(join(root,'_generated/course-spec/native-run.json')));
 assert(run.adapters.length===1,'Installed adapter fragment missing from current run');
 console.log('PASS actual installed Core pointer-v2 and Exporter adapter context');
 for(const method of ['mixed','manual','external']){
  await Deno.writeTextFile(join(root,'index.qmd'),authored.replace('target=prairielearn','target=prairielearn prairielearn-grading="'+method+'"'));
  const capture=await renderNative(root,'full');assert(capture.ok,capture.text);
  const model=JSON.parse(await Deno.readTextFile(join(root,'_generated/course-spec/course.json'))),grading=model.exercises.find((e:any)=>e.id==='exr-pointer').extensions.prairielearn.grading;
  assert(method==='external'?grading==='external':grading.method===method,'Captured grading override differs: '+method);
  console.log('PASS actual installed grading override',method);
 }
 for(const attr of ['prairielearn-grading="unsupported"','prairielearn-gradign="mixed"']){
  await Deno.writeTextFile(join(root,'index.qmd'),authored.replace('target=prairielearn','target=prairielearn '+attr));
  const invalid=await command(['render','--profile','full','--to','html']);
  assert(!invalid.ok&&invalid.text.includes('PL.DECLARATION_INVALID'),'Invalid grading value/key accepted: '+attr+'\n'+invalid.text);
  console.log('REFUSED',attr);
 }
 await Deno.writeTextFile(join(root,'index.qmd'),authored);
 if(Deno.env.get('GRADING_OVERRIDE_ONLY')){console.log('PASS strict grading override boundary');if(Deno.env.get('POINTER_PROBE_KEEP'))console.log('FIXTURE',root);else await Deno.remove(root,{recursive:true});Deno.exit(0)}
 const file=join(root,'_extensions/course-prairielearn/pointer-probe.lua');
 const mutations=[
  ['old pointer-v1',"run.schema='course-native-run-pointer-v1'"],
  ['wrong owner',"run.projectRoot=root..'/other'"],
  ['outside run directory',"run.directory=root..'/outside'"],
  ['wrong profiles',"run.profiles={'student'}"],
 ];
 for(const [name,mutation] of mutations){
  await Deno.writeTextFile(file,`local native=require('./native')\nreturn {{Pandoc=function(doc)\nlocal root=quarto.project.directory\nlocal path=root..'/_generated/course-spec/active-native-run.json'\nlocal f=assert(io.open(path,'r'));local run=pandoc.json.decode(f:read('*a'));f:close()\n${mutation}\nf=assert(io.open(path,'w'));f:write(pandoc.json.encode(run));f:close()\nnative.write(doc,{source=native.source(),exercises=pandoc.List()})\nreturn doc\nend}}\n`);
  await Deno.writeTextFile(join(root,'_quarto.yml'),config.replace('filters: [course-core, course-prairielearn]','filters: [course-core, course-prairielearn, _extensions/course-prairielearn/pointer-probe.lua]'));
  const invalid=await command(['render','--profile','full','--to','html']);
  assert(!invalid.ok&&invalid.text.includes('PL.NATIVE_INVALID'),'Adapter accepted '+name+': '+invalid.text);
  console.log('REFUSED',name);
 }
 await Deno.remove(file);await Deno.writeTextFile(join(root,'_quarto.yml'),config);
 const fresh=await renderNative(root,'full');assert(fresh.ok,fresh.text);
 console.log('PASS fresh native capture after refusals; no failed-run reuse');
}finally{if(Deno.env.get('POINTER_PROBE_KEEP'))console.log('FIXTURE',root);else await Deno.remove(root,{recursive:true})}
