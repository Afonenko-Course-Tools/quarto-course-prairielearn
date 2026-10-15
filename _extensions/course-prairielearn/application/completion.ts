import {createMetrics as __createMetrics} from "../observability/bridge.ts";
const __metrics=__createMetrics("course-prairielearn");
import { closed } from './declarations.ts';
import { qualifiedSlots } from './slots.ts';
export interface CompletionPolicy {schemaVersion:2;mode:'required-slot-completion';source:'per-slot-results-v2';slotIds:string[];requiredSlotIds:string[];atLeast:number;fullyCompletedScore:1}
export function validateCompletionPolicy(p:any):asserts p is CompletionPolicy{
 closed(p,['schemaVersion','mode','source','slotIds','requiredSlotIds','atLeast','fullyCompletedScore']);
 if(p.schemaVersion!==2||p.mode!=='required-slot-completion'||p.source!=='per-slot-results-v2'||p.fullyCompletedScore!==1||!Array.isArray(p.slotIds)||!p.slotIds.length||p.slotIds.some((id:any)=>typeof id!=='string'||!/^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*\/(exr|alt)-[a-z0-9][a-z0-9-]*$/.test(id))||new Set(p.slotIds).size!==p.slotIds.length||!Array.isArray(p.requiredSlotIds)||new Set(p.requiredSlotIds).size!==p.requiredSlotIds.length||p.requiredSlotIds.some((id:string)=>!p.slotIds.includes(id))||!Number.isInteger(p.atLeast)||p.atLeast<1||p.atLeast>p.requiredSlotIds.length)throw new Error('PL.COMPLETION_INVALID: required-slot policy cannot be satisfied');
}
export function completionPolicy(courseId:string,work:any):CompletionPolicy{
 const slots=qualifiedSlots(courseId,work);
 const p:CompletionPolicy={schemaVersion:2,mode:'required-slot-completion',source:'per-slot-results-v2',slotIds:slots.map((s:any)=>s.id),requiredSlotIds:slots.filter((s:any)=>s.assignment.requirement==='required').map((s:any)=>s.id),atLeast:work.extensions?.prairielearn?.pass?.['at-least'],fullyCompletedScore:1};validateCompletionPolicy(p);return p;
}
export function evaluateCompletion(policy:CompletionPolicy,results:any){
 validateCompletionPolicy(policy);closed(results,['schemaVersion','source','slots']);
 if(results.schemaVersion!==2||results.source!==policy.source||!Array.isArray(results.slots)||results.slots.length!==policy.slotIds.length)throw new Error('PL.COMPLETION_RESULTS_INVALID: exact assigned slots required');
 const rows=new Map<string,any>();
 for(const row of results.slots){closed(row,['slotId','qualifiedId','score','status']);if(!policy.slotIds.includes(row.slotId)||rows.has(row.slotId)||typeof row.qualifiedId!=='string'||!['complete','grading','unanswered'].includes(row.status)||row.score!==null&&(typeof row.score!=='number'||!Number.isFinite(row.score)||row.score<0||row.score>1))throw new Error('PL.COMPLETION_RESULTS_INVALID: invalid or duplicate slot score');rows.set(row.slotId,row);}
 const completedRequired=policy.requiredSlotIds.filter(id=>rows.get(id)?.status==='complete'&&rows.get(id).score===1).length;const passed=completedRequired>=policy.atLeast;
 return {completedRequired,requiredTotal:policy.requiredSlotIds.length,atLeast:policy.atLeast,passed,score:passed?1:0};
}

// @ts-expect-error JS допускает замену function binding; сигнатура публичного API сохраняется.
validateCompletionPolicy=__metrics.wrapSync({id:"course-prairielearn.application.completion.validateCompletionPolicy",kind:"phase"},validateCompletionPolicy);
// @ts-expect-error JS допускает замену function binding; сигнатура публичного API сохраняется.
completionPolicy=__metrics.wrapSync({id:"course-prairielearn.application.completion.completionPolicy",kind:"phase"},completionPolicy);
// @ts-expect-error JS допускает замену function binding; сигнатура публичного API сохраняется.
evaluateCompletion=__metrics.wrapSync({id:"course-prairielearn.application.completion.evaluateCompletion",kind:"phase"},evaluateCompletion);
