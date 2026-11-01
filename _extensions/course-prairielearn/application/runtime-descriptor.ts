import {createMetrics as __createMetrics} from "../observability/bridge.ts";
const __metrics=__createMetrics("course-prairielearn");
import { normalizeDiscovery } from './grading-descriptor.ts';
import { javaBuild } from './java-build.ts';
import { safePath } from './source-selection.ts';
export interface AdditionalJavaSources {primaryRequired?:boolean;archive:string;maxFiles:number;maxFileBytes:number;maxTotalBytes:number;maxArchiveBytes:number}
export function validateAdditionalJavaSources(value:any,sources:string[],tests:string[]):AdditionalJavaSources {
  const caps={maxFiles:128,maxFileBytes:1048576,maxTotalBytes:4194304,maxArchiveBytes:2097152};
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['archive','primaryRequired',...Object.keys(caps)].includes(k))||('primaryRequired' in value&&typeof value.primaryRequired!=='boolean')||typeof value.archive!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,100}\.zip$/.test(value.archive)||Object.entries(caps).some(([key,cap])=>!Number.isInteger(value[key])||value[key]<1||value[key]>cap))throw new Error('PL invalid additional Java sources policy');
  if([...sources,...tests,'grading-job.json','tests/grading-job.json'].some(name=>name===value.archive||name.startsWith(value.archive+'/')||value.archive.startsWith(name+'/')))throw new Error('PL additional Java archive conflicts with primary/trusted path');
  return {...value};
}
function publicCases(value:any){
 if(!Array.isArray(value)||value.length>32)throw Error('PL public-cases requires a bounded list');
 const ids=new Set<string>();
 return value.map(c=>{
  if(!c||typeof c!=='object'||Array.isArray(c)||Object.keys(c).some(k=>!['id','name','test','input','state','action','expected'].includes(k))||!['id','name','test','expected'].every(k=>k in c)||!['input','state','action'].some(k=>k in c)||Object.values(c).some(v=>typeof v!=='string'||v.length>8192)||!c.id||!c.test||!c.name.trim()||c.name.length>256||ids.has(c.id))throw Error('PL invalid/ambiguous explicit public case');
  ids.add(c.id);return {...c};
 });
}
export interface ApiPrecheck {files:string[];entry:string}
export function runtimeDescriptor(c: any, profile: any, sources: string[], tests: string[], api?:ApiPrecheck) {
  const build=javaBuild(c,profile);
  const javaRuntime = profile.javaRelease !== undefined || !profile.sourceExtensions;
  if (!javaRuntime && c.java !== undefined) throw new Error('PL non-Java runtime cannot declare Java compiler settings');
  if(Boolean(c['api-precheck'])!==Boolean(api))throw new Error('PL API precheck selection missing or undeclared');
  if(api&&(!['java25-junit-v1','java25-gradle-junit-v1'].includes(c.runtime)||!javaRuntime||c.sourceProfile.mode!=='implementation'||!Array.isArray(api.files)||!api.files.length||new Set(api.files).size!==api.files.length||api.files.length>=tests.length||api.files.some(x=>!safePath(x)||!x.endsWith('.java')||!tests.includes(x))||!/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(api.entry)||api.entry!==c['api-precheck'].entry))throw new Error('PL API precheck must be a proper trusted Java subset');
  if(c.feedback!==undefined&&(!c.feedback||typeof c.feedback!=='object'||Array.isArray(c.feedback)||Object.keys(c.feedback).sort().join(',')!=='requirement,what-check'||Object.values(c.feedback).some(v=>typeof v!=='string'||!v||v.length>8192)))throw Error('PL feedback requires explicit public requirement/what-check');
  const extra=c['additional-java-sources'];
  let additionalJavaSources:AdditionalJavaSources|undefined;
  if(extra!==undefined){
    if(!extra||typeof extra!=='object'||Array.isArray(extra)||!['java25-junit-v1','java25-gradle-junit-v1'].includes(c.runtime)||c.sourceProfile.mode!=='implementation'||Object.keys(extra).some(k=>!['archive','max-files','max-file-bytes','max-total-bytes','max-archive-bytes','primary-required'].includes(k)))throw new Error('PL additional Java sources require closed Java implementation policy');
    additionalJavaSources=validateAdditionalJavaSources({...('primary-required' in extra?{primaryRequired:extra['primary-required']}:{}),archive:extra.archive,maxFiles:extra['max-files'],maxFileBytes:extra['max-file-bytes'],maxTotalBytes:extra['max-total-bytes'],maxArchiveBytes:extra['max-archive-bytes']},sources,tests);
  }
  return {
    schemaVersion:1, sourceFiles:sources, testFiles:tests,
    mode:c.sourceProfile.mode, runtime:c.runtime,
    ...(javaRuntime ? {java:{release:25,encoding:'UTF-8','compiler-options':['-proc:none','-Xmaxerrs','5'],...c.java}} : {}),
    limits:{'outer-seconds':30,'compile-seconds':15,'run-seconds':10,networking:false,'max-output-bytes':65536,...c.limits},
    scoring:c.scoring ?? {mode:'weighted'}, discovery:normalizeDiscovery(c.discovery),
    ...(c.feedback?{feedback:{requirement:c.feedback.requirement,whatCheck:c.feedback['what-check']}}:{}),
    ...(c['public-cases']!==undefined?{publicCases:publicCases(c['public-cases'])}:{}),
    ...(c.variants ? {variants:c.variants} : {}),
    ...(additionalJavaSources?{additionalJavaSources}:{}),
    ...(build?{javaBuild:build}:{}),
    ...(api ? {apiPrecheck:{files:[...api.files],entry:api.entry}} : {}),
  };
}

// @ts-expect-error JS допускает замену function binding; сигнатура публичного API сохраняется.
runtimeDescriptor=__metrics.wrapSync({id:"course-prairielearn.application.runtime-descriptor.runtimeDescriptor",kind:"phase"},runtimeDescriptor);
