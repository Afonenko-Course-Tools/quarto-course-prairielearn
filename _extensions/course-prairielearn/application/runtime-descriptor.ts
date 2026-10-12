import { normalizeDiscovery } from './grading-descriptor.ts';
export function runtimeDescriptor(c: any, profile: any, sources: string[], tests: string[]) {
  const javaRuntime = profile.javaRelease !== undefined || !profile.sourceExtensions;
  if (!javaRuntime && c.java !== undefined) throw new Error('PL non-Java runtime cannot declare Java compiler settings');
  return {
    schemaVersion:1, sourceFiles:sources, testFiles:tests,
    mode:c.sourceProfile.mode, runtime:c.runtime,
    ...(javaRuntime ? {java:{release:25,encoding:'UTF-8','compiler-options':['-proc:none','-Xmaxerrs','5'],...c.java}} : {}),
    limits:{'outer-seconds':30,'compile-seconds':15,'run-seconds':10,networking:false,'max-output-bytes':65536,...c.limits},
    scoring:c.scoring ?? {mode:'weighted'}, discovery:normalizeDiscovery(c.discovery),
    ...(c.variants ? {variants:c.variants} : {}),
  };
}
