// ABI активен, но окружением native child владеет existing C auxiliary composition.
import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { installTsAgent } from './fixtures/performance-agent.ts';
import { captureNativeAuxiliary } from '../_extensions/course-prairielearn/application/native-auxiliary.ts';
const root=await Deno.makeTempDir({prefix:'pl-performance-auxiliary-'});
const key=Symbol.for('course.performance.agent.v1');
const registry=globalThis as unknown as Record<symbol,unknown>;
const savedAgent=registry[key], savedMode=Deno.env.get('COURSE_PERF_MODE'), savedQuarto=Deno.env.get('QUARTO');
try {
  Deno.env.set('COURSE_PERF_MODE','summary');
  const agent=installTsAgent({processId:'auxiliary',outputDirectory:root});
  let overlays=0;
  agent.metrics.childEnv=()=>{overlays++;throw Error('NATIVE_ENV_OVERLAY_FORBIDDEN')};
  const probe=join(root,'probe');
  await Deno.writeTextFile(probe,`#!/bin/sh\ncat > '${root}/input.json'\nprintf '<p>PUBLIC</p>'\nprintf '%s' "$COURSE_PERF_MODE" > '${root}/child-mode'\n`);
  await Deno.chmod(probe,0o755);Deno.env.set('QUARTO',probe);
  let guards=0, stale=false;
  const auxiliary=captureNativeAuxiliary(async()=>{guards++;if(stale)throw Error('LIVE_SOURCE_CHANGED')});
  const {renderPublicBody}=await import('../_extensions/course-prairielearn/application/export.ts');
  const body=()=>renderPublicBody({apiVersion:[1,23,1],resources:[]},[{t:'Para',c:[{t:'Str',c:'PUBLIC'}]}],'fixture',{},'resources','client',{auxiliary});
  const result=await body();
  assert.match(result.html,/PUBLIC/);assert.equal(guards,2);assert.equal(overlays,0);
  assert.equal(await Deno.readTextFile(join(root,'child-mode')),'summary');
  assert.match(await Deno.readTextFile(join(root,'input.json')),/PUBLIC/);
  assert(agent.events.some((e:any)=>e.operation_id==='course-prairielearn.application.export.command'));
  await Deno.remove(join(root,'input.json'));stale=true;
  await assert.rejects(body,/LIVE_SOURCE_CHANGED/);assert.equal(guards,3);assert.equal(overlays,0);
  await assert.rejects(()=>Deno.stat(join(root,'input.json')),Deno.errors.NotFound);
  console.log('PASS active ABI + native frozen env: actual Pandoc stdin/child, pre/post guards, stale→0 child');
} finally {
  if(savedMode===undefined)Deno.env.delete('COURSE_PERF_MODE');else Deno.env.set('COURSE_PERF_MODE',savedMode);
  if(savedQuarto===undefined)Deno.env.delete('QUARTO');else Deno.env.set('QUARTO',savedQuarto);
  if(savedAgent===undefined)Reflect.deleteProperty(registry,key);else registry[key]=savedAgent;
  await Deno.remove(root,{recursive:true});
}
