import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createMetrics } from '../_extensions/course-prairielearn/observability/bridge.ts';

import { installTsAgent } from './fixtures/performance-agent.ts';
const root = await Deno.makeTempDir();
const registry = globalThis as unknown as Record<symbol, unknown>;
const key = Symbol.for('course.performance.agent.v1');
const prior = Deno.env.get('COURSE_PERF_MODE');
try {
  Deno.env.set('COURSE_PERF_MODE', 'off');
  const off = createMetrics('course-prairielearn');
  const fn = () => 42, promise = Promise.resolve(7), asyncFn = () => promise;
  assert.equal(off.wrapSync({ id: 'off', kind: 'function' }, fn), fn);
  assert.equal(off.wrapWalk({ id: 'off-walk', kind: 'ast_walk', scope: 'fragment' }, fn), fn);
  assert.equal(off.wrapAsync({ id: 'off-async', kind: 'function' }, asyncFn), asyncFn);
  assert.equal(off.wrapAsync({ id: 'off-async', kind: 'function' }, asyncFn)(), promise);
  const base = { FUNCTIONAL: 'keep' };
  assert.equal(off.childEnv(base), base);
  Deno.env.set('COURSE_PERF_MODE', 'summary');
  const agent = installTsAgent({ experimentId: 'pl', runId: 'test', processId: 'facade', outputDirectory: root, mode: 'summary' });
  const metrics = createMetrics('course-prairielearn');
  const spec = { id: 'single', kind: 'function' as const, document_id: 'source.qmd', attributes: { extension_id: 'wrong', functional: 7 } };
  metrics.wrapSync(spec, fn)();
  metrics.wrapSync({ id: 'batch', kind: 'function' }, fn)();
  const begins = agent.events.filter((event: any) => event.event === 'begin');
  assert.equal(begins[0].document_id, 'source.qmd');
  assert.deepEqual(begins[0].attributes, { extension_id: 'course-prairielearn', functional: 7 });
  assert.equal(begins[1].document_id, undefined);
  assert.equal(spec.attributes.extension_id, 'wrong');
  console.log('PASS фасад: extension/document, batch без document, off identity');

  await Deno.mkdir(join(root, 'tasks'));
  const probe = join(root, 'probe.ts');
  await Deno.writeTextFile(probe, `#!${Deno.execPath()} run -A\n` + `
const docker=Deno.args[0]==='image';
const record={args:Deno.args,cwd:Deno.cwd(),pid:Deno.pid,ppid:Deno.ppid,span:Deno.env.get('COURSE_PERF_PARENT_SPAN_ID')??null,process:Deno.env.get('COURSE_PERF_PARENT_PROCESS_ID')??null,functional:Deno.env.get('PL_FUNCTIONAL_SENTINEL'),profile:Deno.env.get('QUARTO_PROFILE'),removed:Deno.env.get('PL_REMOVE_SENTINEL')??null,snapshot:Deno.env.get('PL_BASE_FUNCTIONAL_SENTINEL')};
await Deno.writeTextFile(Deno.env.get('PL_PROBE_LOG')!,JSON.stringify(record)+'\\n',{append:true});
if(docker)console.log('sha256:test-image');else{console.error('native inspect probe failure');Deno.exit(23)}
`);
  // Linux shebang допускает один аргумент: shell передаёт неизменные argv Deno.
  const executable = `#!/bin/sh\nexec '${Deno.execPath()}' run -A '${probe}' "$@"\n`;
  await Deno.writeTextFile(join(root, 'quarto'), executable);
  await Deno.writeTextFile(join(root, 'docker'), executable);
  await Deno.chmod(join(root, 'quarto'), 0o755);
  await Deno.chmod(join(root, 'docker'), 0o755);
  const wrapper = join(root, 'wrapper.ts');
  await Deno.writeTextFile(wrapper, `
import {installTsAgent} from ${JSON.stringify(new URL('./fixtures/performance-agent.ts', import.meta.url).href)};
const agent=installTsAgent({experimentId:'pl',runId:'test',processId:'actual-entrypoint',outputDirectory:${JSON.stringify(root)},mode:'summary'});
const run=async()=>{const mod=await import(Deno.env.get('PL_ENTRYPOINT')!);if(Deno.env.get('PL_BOUNDARY')==='render-public-body')await mod.renderPublicBody({resources:[],apiVersion:[1,23,1]},[{t:'Para',c:[{t:'Str',c:'PUBLIC'}]}],'demo/exr-test',{},'resources','client')};
try{if(Deno.env.get('PL_LINKED')==='yes')await agent.metrics.wrapAsync({id:'test.actual-caller',kind:'phase'},run)();else await run()}
finally{agent.flush()}
`);
  for (const entrypoint of ['export-course', 'inspect-grading', 'render-public-body']) {
    for (const linked of [false, true]) {
      const log = join(root, `${entrypoint}-${linked}.jsonl`);
      const args = [root];
      if (entrypoint === 'export-course') args.push(join(root, 'output'));
      args.push('--instance', 'test');
      if (entrypoint === 'export-course') args.push('--checks-output', join(root, 'checks'), '--candidate-image', 'sha256:test-image');
      const result = await new Deno.Command(Deno.execPath(), {
        args: ['run', '--no-check', '-A', wrapper, ...args],
        env: { ...Deno.env.toObject(), PATH: `${root}:${Deno.env.get('PATH')}`, QUARTO: join(root, 'quarto'), PL_ENTRYPOINT: new URL(entrypoint === 'render-public-body' ? '../_extensions/course-prairielearn/application/export.ts' : `../_extensions/course-prairielearn/entrypoints/${entrypoint}.ts`, import.meta.url).href, PL_BOUNDARY: entrypoint, PL_REMOVE_SENTINEL: 'must-remove',
          PL_LINKED: linked ? 'yes' : 'no', PL_PROBE_LOG: log, PL_FUNCTIONAL_SENTINEL: 'functional-value', QUARTO_PROFILE: 'student', COURSE_PERF_PARENT_SPAN_ID: 'ambient-ghost' },
        clearEnv: true, stdout: 'piped', stderr: 'piped',
      }).output();
      assert.equal(result.success, false);
      assert.match(new TextDecoder().decode(result.stderr), /native inspect probe failure/);
      const rows = (await Deno.readTextFile(log)).trim().split('\n').map(line => JSON.parse(line));
      assert.equal(rows.length, entrypoint === 'export-course' ? 2 : 1);
      const events = (await Deno.readTextFile(join(root, 'events/actual-entrypoint/ts.jsonl'))).trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
      const command = events.find(event => event.event === 'begin' && event.operation_id === 'course-prairielearn.application.export.command');
      const caller = events.find(event => event.event === 'begin' && event.operation_id === 'test.actual-caller');
      assert.equal(Boolean(caller), linked);
      if (entrypoint === 'render-public-body') {
        assert(command, 'существующая command boundary записана');
        assert.equal(command.document_id, undefined);
        assert.equal(command.attributes.extension_id, 'course-prairielearn');
        assert.equal(command.parent_span_id, linked ? caller.span_id : undefined);
      }
      for (const row of rows) {
        assert.equal(row.span, entrypoint === 'render-public-body' ? command?.span_id : linked ? caller.span_id : null, `${entrypoint}: stale/incorrect parent`);
        assert.equal(row.process, 'actual-entrypoint');
        assert.equal(row.functional, 'functional-value');
        assert.equal(row.snapshot, 'functional-value', 'full functional snapshot reaches childEnv');
        assert.equal(row.removed, null, 'clearEnv prevents deleted env inheritance');
        assert.equal(row.profile, 'student');
        assert.equal(row.cwd, Deno.cwd());
        const summary = JSON.parse(await Deno.readTextFile(join(root, 'events/actual-entrypoint/ts.summary.json')));
        assert.equal(row.ppid, summary.os_pid);
        assert(row.pid !== row.ppid);
      }
      if (entrypoint === 'export-course') assert.deepEqual(rows[0].args, ['image','inspect','sha256:test-image','--format','{{.Id}}']);
      assert.deepEqual(rows.at(-1).args, entrypoint === 'render-public-body' ? ['pandoc','--from=json','--to=html5','--mathml'] : ['inspect', join(root, 'tasks')]);
      console.log(`PASS ${entrypoint}: actual child, ${linked ? 'recorded caller span' : 'no ambient ghost'}, functional env/argv/cwd/error`);
    }
  }
} finally {
  Reflect.deleteProperty(registry, key);
  if (prior === undefined) Deno.env.delete('COURSE_PERF_MODE'); else Deno.env.set('COURSE_PERF_MODE', prior);
  await Deno.remove(root, { recursive: true });
}
