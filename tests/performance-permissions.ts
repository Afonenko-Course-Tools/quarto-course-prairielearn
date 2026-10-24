import { strict as assert } from 'node:assert';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const extension = Deno.args[0] ? resolve(Deno.args[0]) : new URL('../_extensions/course-prairielearn', import.meta.url).pathname;
const root = await Deno.makeTempDir();
try {
  await Deno.mkdir(join(root, 'tasks'));
  const probe = join(root, 'probe');
  // Реальный shell child читает inherited env; его родитель не может читать все env.
  await Deno.writeTextFile(probe, `#!/bin/sh
printf '%s|%s|%s|%s\\n' "$PL_FUNCTIONAL_SENTINEL" "$QUARTO_PROFILE" "$COURSE_PERF_PARENT_SPAN_ID" "$1" >> '${root}/children'
if [ "$1" = image ]; then printf 'sha256:test-image\\n'; exit 0; fi
if [ "$1" = pandoc ]; then cat > '${root}/body.json'; fi
printf 'native permissions probe failure\\n' >&2
exit 23
`);
  await Deno.chmod(probe, 0o755);
  await Deno.copyFile(probe, join(root, 'docker'));
  await Deno.chmod(join(root, 'docker'), 0o755);
  const parentEnv = { ...Deno.env.toObject(), PATH: `${root}:${Deno.env.get('PATH')}`, QUARTO: probe,
    PL_FUNCTIONAL_SENTINEL: 'functional', QUARTO_PROFILE: 'student', COURSE_PERF_PARENT_SPAN_ID: 'preserve-original-inheritance' };
  for (const state of ['denied-mode', 'off', 'missing-agent']) {
    const allowed = ['QUARTO', 'PRAIRIELEARN_RUNTIME_REGISTRY', ...(state === 'denied-mode' ? [] : ['COURSE_PERF_MODE'])];
    for (const boundary of ['export-course', 'export-inspect', 'inspect-grading', 'render-public-body'].filter(name => !Deno.args[1] || name === Deno.args[1])) {
      await Deno.writeTextFile(join(root, 'children'), '');
      const entrypoint = join(extension, boundary === 'render-public-body' ? 'application/export.ts' : `entrypoints/${boundary === 'export-inspect' ? 'export-course' : boundary}.ts`);
      const wrapper = join(root, 'worker.ts');
      await Deno.writeTextFile(wrapper, boundary === 'render-public-body'
        ? `import {renderPublicBody} from ${JSON.stringify(pathToFileURL(entrypoint).href)}; await renderPublicBody({resources:[],apiVersion:[1,23,1]},[{t:'Para',c:[{t:'Str',c:'PUBLIC'}]}],'demo/exr-test',{},'resources','client');`
        : `await import(${JSON.stringify(pathToFileURL(entrypoint).href)});`);
      const args = [root];
      if (boundary.startsWith('export-')) args.push(join(root, 'output'));
      args.push('--instance', 'test');
      if (boundary.startsWith('export-')) args.push('--checks-output', join(root, 'checks'));
      if (boundary === 'export-course') args.push('--candidate-image', 'sha256:test-image');
      const result = await new Deno.Command(Deno.execPath(), {
        args: ['run', '--no-config', '--no-lock', '--no-check', '--no-prompt', '--allow-read', '--allow-run', `--allow-env=${allowed.join(',')}`, wrapper, ...args],
        env: { ...parentEnv, COURSE_PERF_MODE: state === 'off' ? 'off' : 'summary' },
        clearEnv: true, stdout: 'piped', stderr: 'piped',
      }).output();
      const stderr = new TextDecoder().decode(result.stderr);
      assert.equal(result.success, false);
      assert.match(stderr, /native permissions probe failure/, `${boundary}/${state}: ${stderr}`);
      assert.doesNotMatch(stderr, /Requires env access/);
      const rows = (await Deno.readTextFile(join(root, 'children'))).trim().split('\n');
      const commands = boundary === 'export-course' ? ['image', 'inspect'] : [boundary === 'render-public-body' ? 'pandoc' : 'inspect'];
      assert.deepEqual(rows, commands.map(command => `functional|student|preserve-original-inheritance|${command}`));
      if (boundary === 'render-public-body') assert.match(await Deno.readTextFile(join(root, 'body.json')), /PUBLIC/);
      console.log(`PASS ${boundary}/${state}: scoped env, native child inheritance/error/stdin`);
    }
  }
} finally { await Deno.remove(root, { recursive: true }); }
