import { hash, selectedSources } from '../_extensions/course-prairielearn/application/source-selection.ts';
import { runtimeDescriptor } from '../_extensions/course-prairielearn/application/runtime-descriptor.ts';
const assert = (value: unknown) => { if (!value) throw new Error('Assertion failed'); };
Deno.test('non-Java text source requires an explicit runtime extension allowlist', async () => {
  const root = await Deno.makeTempDir();
  try {
    await Deno.mkdir(root + '/student');
    const text = "cat < headers.txt | grep '^Last-Modified:' > last-modified.txt\n";
    await Deno.writeTextFile(root + '/student/commands.fish', text);
    const fact = {check: {sourceProfile: {root:'student',mode:'implementation'}}, sources:[{projectRelativePath:'student/commands.fish',submissionRelativePath:'commands.fish',sha256:await hash(text)}]};
    assert((await selectedSources(root, fact, {sourceExtensions:['.fish']}))[0].name === 'commands.fish');
    for (const profile of [undefined, {sourceExtensions:['.java']}, {sourceExtensions:[]}, {sourceExtensions:['fish']}, {sourceExtensions:['.fish'],javaRelease:25}]) {
      let denied=false;
      try { await selectedSources(root, fact, profile); } catch { denied=true; }
      assert(denied);
    }
    const changed = {...fact, sources:[{...fact.sources[0],sha256:'0'.repeat(64)}]};
    let denied=false;
    try { await selectedSources(root, changed, {sourceExtensions:['.fish']}); } catch { denied=true; }
    assert(denied);
  } finally { await Deno.remove(root,{recursive:true}); }
});
Deno.test('fish descriptor does not impersonate Java; Java keeps compiler defaults', () => {
  const check = {runtime:'fish-git-v1',sourceProfile:{mode:'implementation'}};
  const descriptor=runtimeDescriptor(check,{sourceExtensions:['.fish']},['commands.fish'],['headers.txt']);
  assert(!Object.hasOwn(descriptor,'java') && descriptor.sourceFiles[0]==='commands.fish');
  const java=runtimeDescriptor({...check,runtime:'java25-junit-v1'},{javaRelease:25},['S.java'],['T.java']);
  assert(java.java.release===25 && java.java.encoding==='UTF-8');
});
