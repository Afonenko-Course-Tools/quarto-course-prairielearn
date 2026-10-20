import {createMetrics as __createMetrics} from "../observability/bridge.ts";
const __metrics=__createMetrics("course-prairielearn");
import { closed } from './declarations.ts';
export function validateSlots(slots:any, courseId:string, workId:string, qualified=false){
 if(!Array.isArray(slots)||!slots.length)throw new Error('PL.SLOTS_INVALID: required slots v2');
 const ids=new Set(),candidates=new Set();
 const exr=new RegExp(qualified?`^${courseId}/exr-[a-z0-9][a-z0-9-]*$`:'^exr-[a-z0-9][a-z0-9-]*$');
 for(const slot of slots){
  closed(slot,['id','selection','candidates','assignment']);
  const local=qualified?slot.id?.replace(courseId+'/'+workId+'/',''):slot.id;
  if(typeof slot.id!=='string'||qualified&&!slot.id.startsWith(courseId+'/'+workId+'/')||ids.has(slot.id)||!Array.isArray(slot.candidates)||slot.candidates.some((id:any)=>typeof id!=='string'||!exr.test(id)||candidates.has(id))||new Set(slot.candidates).size!==slot.candidates.length||slot.selection==='fixed'&&(slot.candidates.length!==1||local!==slot.candidates[0].split('/').at(-1))||['random','choice'].includes(slot.selection)&&(!/^alt-[a-z0-9][a-z0-9-]*$/.test(local)||slot.candidates.length<2)||!['fixed','random','choice'].includes(slot.selection))throw new Error('PL.SLOTS_INVALID: invalid identity, selection or candidate set');
  ids.add(slot.id);slot.candidates.forEach((id:string)=>candidates.add(id));
  closed(slot.assignment,['requirement','workMode'],['stage']);
  if(slot.selection==='choice'&&slot.assignment.requirement!=='required'||!['required','optional'].includes(slot.assignment.requirement)||!['individual','pair','group'].includes(slot.assignment.workMode)||slot.assignment.stage!==undefined&&!['demonstration','classroom','homework'].includes(slot.assignment.stage))throw new Error('PL.SLOTS_INVALID: invalid assignment');
 }
 return slots;
}
export function qualifiedSlots(courseId:string,work:any){return validateSlots(work.slots,courseId,work.id).map((slot:any)=>({...slot,id:courseId+'/'+work.id+'/'+slot.id,candidates:slot.candidates.map((id:string)=>courseId+'/'+id)}));}
export function nativeSlotBlocks(courseId:string,work:any,grading:any){
 return validateSlots(work.slots,courseId,work.id).map((slot:any)=>{
  if(slot.selection==='choice')throw Error('PL.SLOTS_INVALID: choice requires nativeSlotZones');
  const preferences={courseRequirement:slot.assignment.requirement};
  return slot.selection==='random'
   ? {numberChoose:1,alternatives:slot.candidates.map((id:string)=>({id:courseId+'/'+id,preferences})),...grading.slots[slot.id]}
   : {id:courseId+'/'+slot.candidates[0],...grading.slots[slot.id],preferences};
 });
}

/** Choice is a separate visible best-one zone; regular blocks keep their semantics. */
export function nativeSlotZones(courseId:string,work:any,grading:any){
 const slots=validateSlots(work.slots,courseId,work.id),zones:any[]=[];let regular:any[]=[];
 const flush=()=>{if(regular.length){zones.push({title:work.title,questions:nativeSlotBlocks(courseId,{...work,slots:regular},grading)});regular=[]}};
 for(const slot of slots){
  if(slot.selection!=='choice'){regular.push(slot);continue}
  flush();zones.push({title:'Выполните одну из задач',bestQuestions:1,questions:slot.candidates.map((id:string)=>({id:courseId+'/'+id,...grading.slots[slot.id],preferences:{courseRequirement:slot.assignment.requirement}}))});
 }
 flush();return zones;
}

// @ts-expect-error JS допускает замену function binding; сигнатура публичного API сохраняется.
validateSlots=__metrics.wrapSync({id:"course-prairielearn.application.slots.validateSlots",kind:"phase"},validateSlots);
// @ts-expect-error JS допускает замену function binding; сигнатура публичного API сохраняется.
qualifiedSlots=__metrics.wrapSync({id:"course-prairielearn.application.slots.qualifiedSlots",kind:"phase"},qualifiedSlots);
// @ts-expect-error JS допускает замену function binding; сигнатура публичного API сохраняется.
nativeSlotBlocks=__metrics.wrapSync({id:"course-prairielearn.application.slots.nativeSlotBlocks",kind:"phase"},nativeSlotBlocks);

// @ts-expect-error JS допускает замену function binding; сигнатура публичного API сохраняется.
nativeSlotZones=__metrics.wrapSync({id:"course-prairielearn.application.slots.nativeSlotZones",kind:"phase"},nativeSlotZones);
