import {question} from '../_extensions/course-prairielearn/application/declarations.ts';
import {gradingPolicy,validateGradingComponents} from '../_extensions/course-prairielearn/application/grading-policy.ts';
const assert=(value:unknown,message:string)=>{if(!value)throw Error(message)};
Deno.test('manual/mixed declarations сохраняют явный метод и отвергают неизвестные поля',()=>{
 for(const method of ['manual','mixed']){
  const parsed=question({topic:'Synthetic',submission:{mode:'upload'},grading:{method}});
  assert(parsed.grading?.method===method,'Grading method lost');
 }
 for(const grading of [{method:'automatic'},{method:'manual',runtime:'fake'},'manual']){
  let rejected=false;try{question({topic:'Synthetic',submission:{mode:'upload'},grading})}catch{rejected=true}assert(rejected,'Invalid grading declaration accepted');
 }
});
Deno.test('native auto/manual components остаются явными, не выводятся из tests',()=>{
 const work={id:'sec-fixture',kind:'lab',slots:[{id:'exr-fixture',selection:'fixed',candidates:['exr-fixture'],assignment:{requirement:'required',workMode:'individual'}}],extensions:{prairielearn:{attempts:3,pass:{'at-least':1},'auto-points':0,'manual-points':2}}} as any;
 const manual=gradingPolicy(work).slots['exr-fixture'];assert(manual.autoPoints===0&&manual.manualPoints===2&&!Object.hasOwn(manual,'points'),'Manual native components changed');
 work.extensions.prairielearn['auto-points']=1;
 const mixed=gradingPolicy(work).slots['exr-fixture'];assert(mixed.autoPoints===1&&mixed.manualPoints===2&&!Object.hasOwn(mixed,'points'),'Mixed native components changed');
 work.extensions.prairielearn['question-points']=3;
 let rejected=false;try{gradingPolicy(work)}catch{rejected=true}assert(rejected,'Ambiguous points and component fields accepted');
});

Deno.test('manual/mixed не получают совместимую по ошибке automatic/full оценку',()=>{
 const work={id:'sec-fixture',kind:'lab',slots:[{id:'exr-fixture',selection:'fixed',candidates:['exr-fixture'],assignment:{requirement:'required',workMode:'individual'}}],extensions:{prairielearn:{attempts:1,pass:{'at-least':1},'auto-points':0,'manual-points':2}}} as any;
 validateGradingComponents(work,{'exr-fixture':'manual'});
 for(const method of ['mixed','external'] as const){let rejected=false;try{validateGradingComponents(work,{'exr-fixture':method})}catch{rejected=true}assert(rejected,'Wrong method accepted for manual components')}
 work.extensions.prairielearn['auto-points']=1;validateGradingComponents(work,{'exr-fixture':'mixed'});
 let rejected=false;try{validateGradingComponents(work,{'exr-fixture':'manual'})}catch{rejected=true}assert(rejected,'Manual received fake auto points');
});

import {exportPrairieLearn} from '../_extensions/course-prairielearn/application/export.ts';
import {infoQuestion} from '../_extensions/course-prairielearn/application/native-validators.js';
Deno.test('manual upload экспортируется без runtime и tests, с native Manual и скрытым эталоном',async()=>{
 const root=await Deno.makeTempDir({prefix:'manual-export-'});
 try{
  await Deno.mkdir(root+'/projects/report/student',{recursive:true});await Deno.writeTextFile(root+'/projects/report/student/README.md','PUBLIC_README');
  const pkg={schema:'course-body-package-v2',owner:'synthetic',release:'native',apiVersion:[1,23,1],questions:[{owner:'synthetic',id:'exr-report',key:'synthetic/exr-report',title:'Исследование',difficulty:'introductory',source:'report.qmd',visibility:'public',statementVisibility:'open',hasPublicSolution:false,answerType:'manual',condition:[{t:'Para',c:[{t:'Str',c:'PUBLIC_CONDITION'}]}],publicAnswer:[]}],works:[{owner:'synthetic',id:'sec-report',key:'synthetic/sec-report',source:'report.qmd',kind:'lab',title:'Исследование',slots:[{id:'synthetic/sec-report/exr-report',selection:'fixed',candidates:['synthetic/exr-report'],assignment:{requirement:'required',workMode:'individual'}}]}],resources:[]};
  await exportPrairieLearn(pkg,{projectRoot:root,projects:{'exr-report':'/projects/report'}},{questions:{'exr-report':{topic:'Synthetic',grading:{method:'manual'},submission:{mode:'upload'},files:[]}}},root+'/out');
  const base=root+'/out/questions/synthetic/exr-report',info=JSON.parse(await Deno.readTextFile(base+'/info.json')),html=await Deno.readTextFile(base+'/question.html');
  assert(infoQuestion(info)&&info.gradingMethod==='Manual'&&info.showCorrectAnswer===false&&!info.externalGradingOptions,'Native Manual declaration invalid');
  assert(html.includes('file-patterns="*"')&&!html.includes('pl-external-grader-results'),'Manual requires fake auto result or fixed upload filename');
  let missing=false;try{await Deno.stat(base+'/tests')}catch(e){missing=e instanceof Deno.errors.NotFound}assert(missing,'Manual received fake grader tests');
 }finally{await Deno.remove(root,{recursive:true})}
});
