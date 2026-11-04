// Genuine ordinary Core callback; не Cmain/assignment и не private DTO fixture.
import { strict as assert } from 'node:assert';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const repo = dirname(dirname(fileURLToPath(import.meta.url)));
async function copy(source: string, target: string) {
  const st = await Deno.lstat(source);
  assert(!st.isSymlink);
  if (st.isDirectory) {
    await Deno.mkdir(target, { recursive: true });
    for await (const child of Deno.readDir(source)) await copy(join(source, child.name), join(target, child.name));
  } else {
    assert(st.isFile);
    await Deno.copyFile(source, target);
    if (st.mode !== null) await Deno.chmod(target, st.mode & 0o777);
  }
}
export async function runPublicationCases(coreSource: string, downloadSource?: string) {
  const output = Deno.env.get('PUBLICATION_TEST_OUTPUT');
  const parent = output ? resolve(output) : await Deno.makeTempDir({ prefix: 'pl-publication-' });
  await Deno.mkdir(parent, { recursive: true });
  const checks: unknown[] = [];
  try {
    for (const variant of ['missing-visible', 'missing-hidden', 'valid', ...(downloadSource ? ['no-pl'] : [])]) {
      const root = await Deno.makeTempDir({ dir: parent, prefix: variant + '-' });
      for (const [source, name] of [[coreSource, 'course-core'], [repo, 'course-prairielearn'], ...(downloadSource ? [[downloadSource, 'project-download']] : [])]) {
        await copy(join(source, '_extensions', name), join(root, '_extensions', name));
      }
      const put = async (path: string, text: string) => { await Deno.mkdir(dirname(join(root, path)), { recursive: true }); await Deno.writeTextFile(join(root, path), text); };
      await put('project/starter.txt', 'STARTER_PUBLIC\n');
      await put('common/visible.txt', 'COMMON_VISIBLE\n');
      await put('common/hidden.txt', 'COMMON_HIDDEN\n');
      await put('assets/public.txt', 'ORDINARY_RESOURCE_PUBLIC\n');
      await put('_quarto.yml', `project:
  type: website
  output-dir: _site
  render: [question.qmd, work.qmd]
  pre-render: [quarto run _extensions/course-core/entrypoints/native-pre.ts]
  post-render: [quarto run _extensions/course-core/entrypoints/native-post.ts]
format: {html: {theme: none}}
filters: [course-core${downloadSource ? ', project-download' : ''}]
course: {id: ordinary-publication, view: student, adapters: ${variant === 'no-pl' ? '[]' : '[prairielearn]'}}
course-core-runtime: native-ts
course-core-projection: student
exercise-bank: true
default-exercise-difficulty: introductory
default-exercise-time: 5
default-exercise-course-role: false
default-exercise-target: ${variant === 'no-pl' ? 'manual' : 'prairielearn'}
default-exercise-statement-visibility: open
prairielearn:
  question-defaults: {topic: Test, single-variant: true, grading: {method: manual}, submission: {mode: upload}}
  assessment-defaults: {assignment: {mode: assessment-id}}
${downloadSource ? 'project-download:\n  course-model: true\n  resources:\n    public-data: {path: assets, gitignore: false}\n' : ''}`);
      await put('_quarto-student.yml', 'course-core-projection: student\n');
      await put('question.qmd', `---
project-materialization:
  projects:
    exr-visible:
      common-files: [{source: ${variant === 'missing-visible' ? '/missing-visible.txt' : '/common/visible.txt'}, target: student/visible.txt, audience: student}]
    exr-hidden:
      common-files: [{source: ${variant === 'missing-hidden' ? '/missing-hidden.txt' : '/common/hidden.txt'}, target: grading/hidden.txt, audience: grading}]
---
# Вопросы

::: {#exr-visible project=/project ${variant === 'no-pl' ? '' : 'prairielearn-grading=manual'}}
## Видимая задача
Открытое условие.
:::

::: {#exr-hidden statement-visibility=restricted project=/project ${variant === 'no-pl' ? '' : 'prairielearn-grading=manual'}}
## Скрытая задача
PRIVATE_STATEMENT
:::

[Материал](assets/public.txt)

${downloadSource ? '{{< project-download public-data >}}' : ''}
`);
      await put('work.qmd', '---\nassessment:\n  id: sec-work\n  kind: lab\n  prairielearn:\n    pass: {at-least: 1}\n    attempts: 1\n    auto-points: 0\n    manual-points: 10\n---\n# Работа {#sec-work}\n\n::: {.task-items requirement=required}\n- @exr-visible\n:::\n');
      const render = await new Deno.Command(Deno.env.get('QUARTO') || 'quarto', { args: ['render', '--to', 'html', '--profile', 'student'], cwd: root, stdout: 'piped', stderr: 'piped' }).output();
      await Deno.writeFile(join(parent, variant + '-render.stdout'), render.stdout);
      await Deno.writeFile(join(parent, variant + '-render.stderr'), render.stderr);
      assert(render.success, new TextDecoder().decode(render.stderr));
      assert(!(await Deno.readTextFile(join(root, '_site/question.html'))).includes('PRIVATE_STATEMENT'));
      const Core = await import(pathToFileURL(join(root, '_extensions/course-core/public.ts')).href);
      const PL = await import(pathToFileURL(join(root, '_extensions/course-prairielearn/public.ts')).href);
      const expected = { root, projection: 'student', profiles: ['student'], outputDirectory: join(root, '_site') };
      const request = { expectedSources: ['question.qmd', 'work.qmd'] };
      const inspect = () => Core.withCurrentNativeOperation(expected, (op: any) => PL.inspectPublication(Core, op, request));
      if (variant.startsWith('missing-')) {
        await assert.rejects(inspect, /RELEASE.SOURCE_POLICY/);
        checks.push({ variant, missingCommonRefusedBeforeProjection: true });
        continue;
      }
      const data = await inspect();
      assert.equal(data.proof.schema, 'course-native-release-proof-v1');
      assert.deepEqual(data.proof.validatedAdapters, variant === 'no-pl' ? [] : ['prairielearn']);
      assert.equal(data.documents.length, variant === 'no-pl' ? 0 : 2);
      if (variant !== 'no-pl') {
        await assert.rejects(() => Core.withCurrentNativeOperation(expected, (op: any) => op.validateRelease(request, [PL.createNativeAdapter({ root, core: Core })])), /PL.ASSESSMENT_UNQUALIFIED/);
        await assert.rejects(() => Core.withCurrentNativeOperation(expected, (op: any) => PL.inspectPublication(Core, op, { expectedSources: ['question.qmd'] })), /RELEASE.COVERAGE/);
      }
      await assert.rejects(() => Core.withCurrentNativeOperation({ ...expected, profiles: ['foreign'] }, () => {}), /OPERATION_BINDING/);
      if (downloadSource) {
        const Down = await import(pathToFileURL(join(root, '_extensions/project-download/public.ts')).href);
        const count = await Down.finishDownloads(root, { native: true, profiles: ['student'], projection: 'student', outputDirectory: join(root, '_site') });
        assert.equal(count, 1);
        const receipt = JSON.parse(await Deno.readTextFile(join(root, '_generated/project-download/artifacts-receipt.json')));
        assert.equal(receipt.release.validationPasses, 1);
        assert.deepEqual(receipt.release.proof.validatedAdapters, variant === 'no-pl' ? [] : ['prairielearn']);
        assert.equal(receipt.release.proof.operation, receipt.operation);
        const zip = await new Deno.Command('unzip', { args: ['-p', join(root, '_site/_downloads/public-data.zip'), 'public.txt'], stdout: 'piped', stderr: 'piped' }).output();
        assert(zip.success);assert.equal(new TextDecoder().decode(zip.stdout), 'ORDINARY_RESOURCE_PUBLIC\n');
      }
      checks.push({ variant, genuineOrdinaryProof: true, download: !!downloadSource });
    }
    console.log(JSON.stringify({ status: 'PASS_GENUINE_ORDINARY_PUBLICATION', checks, limit: 'No Cmain/assignment/P; ordinary public operation only' }, null, 2));
  } finally {
    if (!output) await Deno.remove(parent, { recursive: true });
  }
}
if (import.meta.main) await runPublicationCases(resolve(Deno.args[0]));
