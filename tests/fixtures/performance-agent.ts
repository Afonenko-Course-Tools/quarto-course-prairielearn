// Узкий ABI backend теста: собственные записанные spans и настоящий async context.
// Это не production runtime и не реализация Performance.
import { AsyncLocalStorage } from 'node:async_hooks';
import { join } from 'node:path';
import type { OperationSpec } from '../../_extensions/course-prairielearn/observability/bridge.ts';
export function installTsAgent(config: { processId: string; outputDirectory: string; [key: string]: unknown }) {
  const context = new AsyncLocalStorage<string>();
  const events: any[] = [];
  let serial = 0;
  const begin = (spec: OperationSpec) => {
    const span_id = `${config.processId}-${++serial}`;
    events.push({ ...spec, event: 'begin', operation_id: spec.id, span_id, parent_span_id: context.getStore() });
    return span_id;
  };
  const wrapSync = (spec: OperationSpec, fn: any) => function(this: unknown, ...args: unknown[]) {
    const id = begin(spec);
    return context.run(id, () => { try { return fn.apply(this, args); } finally { events.push({ event: 'end', span_id: id }); } });
  };
  const wrapAsync = (spec: OperationSpec, fn: any) => async function(this: unknown, ...args: unknown[]) {
    const id = begin(spec);
    return await context.run(id, async () => { try { return await fn.apply(this, args); } finally { events.push({ event: 'end', span_id: id }); } });
  };
  const metrics = { wrapSync, wrapAsync, wrapWalk: wrapSync, childEnv(base: Record<string,string>) {
    const env: Record<string,string> = { ...base, COURSE_PERF_PARENT_PROCESS_ID: config.processId, PL_BASE_FUNCTIONAL_SENTINEL: base.PL_FUNCTIONAL_SENTINEL ?? 'missing-snapshot' };
    delete env.PL_REMOVE_SENTINEL;
    delete env.COURSE_PERF_PARENT_SPAN_ID;
    const current = context.getStore();
    if (current) env.COURSE_PERF_PARENT_SPAN_ID = current;
    return env;
  } };
  const agent = { abiVersion: 1, metrics, events, flush() {
    const dir = join(config.outputDirectory, 'events', config.processId);
    Deno.mkdirSync(dir, { recursive: true });
    Deno.writeTextFileSync(join(dir, 'ts.jsonl'), events.map(event => JSON.stringify(event)).join('\n'));
    Deno.writeTextFileSync(join(dir, 'ts.summary.json'), JSON.stringify({ os_pid: Deno.pid }));
  } };
  (globalThis as unknown as Record<symbol, unknown>)[Symbol.for('course.performance.agent.v1')] = agent;
  return agent;
}
