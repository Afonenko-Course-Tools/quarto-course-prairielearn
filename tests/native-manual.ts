import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const repo=dirname(dirname(fileURLToPath(import.meta.url))),core=resolve(Deno.args[0]??'../quarto-course');
const root=await Deno.makeTempDir({prefix:'pl-native-manual-'});
const assert=(value:unknown,message:string)=>{if(!value)throw Error(message)};
async function copy(source:string,target:string){await Deno.mkdir(target,{recursive:true});for await(const entry of Deno.readDir(source)){const from=join(source,entry.name),to=join(target,entry.name);if(entry.isDirectory)await copy(from,to);else if(entry.isFile)await Deno.copyFile(from,to)}}
async function command(args:string[],cwd=root){const result=await new Deno.Command('quarto',{args,cwd,stdout:'piped',stderr:'piped'}).output();assert(result.success,new TextDecoder().decode(result.stdout)+new TextDecoder().decode(result.stderr))}
try{
 await copy(join(repo,'examples/native-course'),root);const book=join(root,'tasks'),config=join(book,'_quarto.yml');
 await Deno.writeTextFile(config,(await Deno.readTextFile(config)).replace('default-exercise-project-check: junit','default-exercise-project-check: false').replace('    question-points: 1','    auto-points: 0\n    manual-points: 2').replace('  question-defaults:\n','  question-defaults:\n    grading: {method: manual}\n').replace('mode: editor','mode: upload').replace('      ace-mode: ace/mode/java\n',''));
 await Deno.writeTextFile(join(book,'projects/add/student/README.md'),'Публичная инструкция\n');
 await command(['add',core,'--no-prompt'],book);await command(['add',repo,'--no-prompt'],book);
 await Deno.writeTextFile(join(root,'registry.json'),JSON.stringify({schemaVersion:1,profiles:{}}));
 await command(['run',join(book,'_extensions/course-prairielearn/entrypoints/export-course.ts'),root,join(root,'native'),'--instance','pilot','--checks-output',join(root,'checks.json'),'--runtime-registry',join(root,'registry.json'),'--book','tasks']);
 const base=join(root,'native/questions/native-java-demo/exr-add'),info=JSON.parse(await Deno.readTextFile(join(base,'info.json'))),checks=JSON.parse(await Deno.readTextFile(join(root,'checks.json')));
 assert(info.gradingMethod==='Manual'&&!info.externalGradingOptions,'Manual requires fake External runtime');assert(checks.projects.length===0,'Manual received fake check');
 const assessment=JSON.parse(await Deno.readTextFile(join(root,'native/courseInstances/pilot/assessments/sec-add/infoAssessment.json'))),question=assessment.zones[0].questions[0];assert(question.autoPoints===0&&question.manualPoints===2&&!Object.hasOwn(question,'points'),'Explicit native component weights lost');
 assert((await Deno.readTextFile(join(base,'clientFilesQuestion/README.md'))).includes('Публичная'),'Manual starter README missing');
 console.log('PASS реальный native manual owner export без runtime/check/tests, явные manualPoints');
}finally{await Deno.remove(root,{recursive:true})}
