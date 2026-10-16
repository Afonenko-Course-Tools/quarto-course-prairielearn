import {createMetrics as __createMetrics} from "../observability/bridge.ts";
const __metrics=__createMetrics("course-prairielearn");
import { normalizeDiscovery } from './grading-descriptor.ts';
import { safePath } from './source-selection.ts';
export interface ApiPrecheck {files:string[];entry:string}
export function runtimeDescriptor(c: any, profile: any, sources: string[], tests: string[], api?:ApiPrecheck) {
  const javaRuntime = profile.javaRelease !== undefined || !profile.sourceExtensions;
  if (!javaRuntime && c.java !== undefined) throw new Error('PL non-Java runtime cannot declare Java compiler settings');
  if(Boolean(c['api-precheck'])!==Boolean(api))throw new Error('PL API precheck selection missing or undeclared');
  if(api&&(!javaRuntime||c.sourceProfile.mode!=='implementation'||!Array.isArray(api.files)||!api.files.length||new Set(api.files).size!==api.files.length||api.files.length>=tests.length||api.files.some(x=>!safePath(x)||!x.endsWith('.java')||!tests.includes(x))||!/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(api.entry)||api.entry!==c['api-precheck'].entry))throw new Error('PL API precheck must be a proper trusted Java subset');
  return {
    schemaVersion:1, sourceFiles:sources, testFiles:tests,
    mode:c.sourceProfile.mode, runtime:c.runtime,
    ...(javaRuntime ? {java:{release:25,encoding:'UTF-8','compiler-options':['-proc:none','-Xmaxerrs','5'],...c.java}} : {}),
    limits:{'outer-seconds':30,'compile-seconds':15,'run-seconds':10,networking:false,'max-output-bytes':65536,...c.limits},
    scoring:c.scoring ?? {mode:'weighted'}, discovery:normalizeDiscovery(c.discovery),
    ...(c.variants ? {variants:c.variants} : {}),
    ...(api ? {apiPrecheck:{files:[...api.files],entry:api.entry}} : {}),
  };
}

// @ts-expect-error JS допускает замену function binding; сигнатура публичного API сохраняется.
runtimeDescriptor=__metrics.wrapSync({id:"course-prairielearn.application.runtime-descriptor.runtimeDescriptor",kind:"phase"},runtimeDescriptor);
