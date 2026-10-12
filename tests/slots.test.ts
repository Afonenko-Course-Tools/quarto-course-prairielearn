import { completionPolicy } from '../_extensions/course-prairielearn/application/completion.ts';
import { gradingPolicy } from '../_extensions/course-prairielearn/application/grading-policy.ts';
const assert=(v:unknown,m:string)=>{if(!v)throw new Error(m)};
Deno.test('random group contributes one completion and one grading block',()=>{
 const w={id:'sec-lab',kind:'lab',slots:[{id:'alt-numbers',selection:'random',candidates:['exr-a','exr-b'],assignment:{requirement:'required',workMode:'individual'}}],extensions:{prairielearn:{attempts:3,'question-points':1,pass:{'at-least':1}}}};
 const p=completionPolicy('demo',w);
 assert(p.schemaVersion===2&&p.slotIds.length===1&&p.requiredSlotIds[0]==='demo/sec-lab/alt-numbers','catalog candidates counted as slots');
 assert(gradingPolicy(w).slots['alt-numbers'].triesPerVariant===3,'slot attempts missing');
});
import {nativeSlotBlocks,validateSlots} from '../_extensions/course-prairielearn/application/slots.ts';
import {validateAssessmentSemantics} from '../_extensions/course-prairielearn/application/native-semantics.ts';
Deno.test('random native block chooses one and rejects id with alternatives or zone subsets',()=>{
 const w={id:'sec-lab',kind:'lab',slots:[{id:'alt-x',selection:'random',candidates:['exr-a','exr-b'],assignment:{requirement:'required',workMode:'individual'}}],extensions:{prairielearn:{attempts:3,'question-points':1,pass:{'at-least':1}}}};
 const blocks=nativeSlotBlocks('demo',w,gradingPolicy(w));
 assert(blocks.length===1&&blocks[0].numberChoose===1&&blocks[0].points===1&&blocks[0].alternatives.length===2&&!('id' in blocks[0]),'one native alternative block required');
 for(const value of [{type:'Homework',zones:[{numberChoose:1,questions:blocks}]},{type:'Homework',zones:[{questions:[{...blocks[0],id:'demo/exr-a'}]}]}]){
  let rejected=false;try{validateAssessmentSemantics(value,'test')}catch{rejected=true}assert(rejected,'ambiguous native selection accepted');
 }
});
Deno.test('pinned native pools carry preferences on eligible alternatives and preserve one priced slot',()=>{
 for(const requirement of ['required','optional']){
  const assignment={requirement,workMode:'individual'};
  const w={id:'sec-lab',kind:'lab',slots:[{id:'alt-x',selection:'random',candidates:['exr-a','exr-b'],assignment},{id:'exr-c',selection:'fixed',candidates:['exr-c'],assignment}],extensions:{prairielearn:{attempts:3,'question-points':2,'question-max-points':6,pass:{'at-least':requirement==='required'?1:0}}}};
  const [pool,fixed]=nativeSlotBlocks('demo',w,gradingPolicy(w));
  assert(!('preferences' in pool),'pinned sync forbids preferences on alternative pools');
  assert(pool.numberChoose===1&&pool.points===2&&pool.maxPoints===6&&pool.triesPerVariant===3&&pool.alternatives.length===2,'one selected slot must inherit authoritative pricing and three graded submissions');
  assert(pool.alternatives.every((alternative:any)=>alternative.preferences?.courseRequirement===requirement&&!('points' in alternative)&&!('triesPerVariant' in alternative)),'eligible alternatives must carry question preferences while pricing remains per slot');
  assert(fixed.id==='demo/exr-c'&&fixed.preferences.courseRequirement===requirement&&fixed.triesPerVariant===3,'fixed native question preferences changed');
 }
});
Deno.test('pinned native semantic boundary rejects pool preferences even when schema-valid',()=>{
 for(const preferences of [{},{courseRequirement:'required'}]){
  let rejected=false;
  try{validateAssessmentSemantics({type:'Homework',zones:[{questions:[{numberChoose:1,points:1,triesPerVariant:3,preferences,alternatives:[{id:'demo/exr-a'},{id:'demo/exr-b'}]}]}]},'pool/infoAssessment.json')}catch(error){rejected=String(error).includes('preferences')&&String(error).includes('pool/infoAssessment.json')}
  assert(rejected,'schema-valid pool preferences passed the pinned sync boundary');
 }
});
