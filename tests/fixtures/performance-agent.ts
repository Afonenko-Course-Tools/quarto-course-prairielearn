// Узкий ABI backend теста: собственные spans и настоящий async context.
import { AsyncLocalStorage } from 'node:async_hooks';
import { join } from 'node:path';
import type { Metrics, OperationSpec } from '../../_extensions/course-prairielearn/observability/bridge.ts';

type Event = (OperationSpec & {
  event: 'begin'; operation_id: string; span_id: string; parent_span_id?: string;
}) | { event: 'end'; span_id: string };

export function installTsAgent(config: { processId: string; outputDirectory: string; [key: string]: unknown }) {
  const context = new AsyncLocalStorage<string>();
  const events: Event[] = [];
  let serial = 0;
  const begin = (spec: OperationSpec) => {
    const span_id = `${config.processId}-${++serial}`;
    const parent = context.getStore();
    events.push({ ...spec, event: 'begin', operation_id: spec.id, span_id,
      ...(parent === undefined ? {} : { parent_span_id: parent }) });
    return span_id;
  };
  const wrapSync = <This, Args extends unknown[], Result>(spec: OperationSpec, fn: (this: This, ...args: Args) => Result) => function(this: This, ...args: Args): Result {
    const id = begin(spec);
    return context.run(id, () => { try { return fn.apply(this, args); } finally { events.push({ event: 'end', span_id: id }); } });
  };
  const wrapAsync = <This, Args extends unknown[], Result>(spec: OperationSpec, fn: (this: This, ...args: Args) => Promise<Result>) => async function(this: This, ...args: Args): Promise<Result> {
    const id = begin(spec);
    return await context.run(id, async () => { try { return await fn.apply(this, args); } finally { events.push({ event: 'end', span_id: id }); } });
  };
  const metrics: Metrics = { wrapSync, wrapAsync, wrapWalk: wrapSync, childEnv(base) {
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
  Reflect.set(globalThis, Symbol.for('course.performance.agent.v1'), agent);
  return agent;
}
