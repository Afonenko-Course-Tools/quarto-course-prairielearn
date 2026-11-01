// Настоящий entrypoint: ранний выбор явного пути без Quarto/model fixture.
import {fileURLToPath} from 'node:url';
const entry=fileURLToPath(new URL('../_extensions/course-prairielearn/entrypoints/export-course.ts',import.meta.url));
const key='PRAIRIELEARN_PUBLICATION_CONDITIONS';
function assert(value:unknown,message:string):asserts value {if(!value)throw Error(message)}
async function invoke(environment:string|undefined,cli?:string){
 const env=Deno.env.toObject();delete env[key];if(environment!==undefined)env[key]=environment;
 const args=['run','--no-config','--cached-only','--allow-read','--allow-env',entry];
 if(cli!==undefined)args.push('/nonexistent-course','/nonexistent-output','--publication-conditions',cli);
 const result=await new Deno.Command(Deno.execPath(),{args,clearEnv:true,env,stdout:'piped',stderr:'piped'}).output();
 return {success:result.success,text:new TextDecoder().decode(result.stderr)};
}
Deno.test('entrypoint без CLI и ENV сохраняет прежнюю usage границу',async()=>{
 const r=await invoke(undefined);assert(!r.success&&r.text.includes('Usage: export-course.ts')&&!r.text.includes('ambiguous'),'Изменена прежняя граница отсутствующего input');
});
Deno.test('ENV должен содержать явный абсолютный manifest path',async()=>{
 for(const value of ['', 'relative-conditions.json']){const r=await invoke(value);assert(!r.success&&r.text.includes('publication conditions absolute path required'),'Относительный или пустой ENV принят');}
});
Deno.test('CLI и ENV одновременно отвергаются даже с одинаковым путём',async()=>{
 for(const value of ['/one.json','/different.json']){const r=await invoke(value,'/one.json');assert(!r.success&&r.text.includes('ambiguous publication conditions input'),'CLI/ENV неоднозначность скрыта');}
});
Deno.test('один абсолютный ENV или CLI проходит выбор пути до прежнего usage guard',async()=>{
 for(const [env,cli] of [['/conditions.json',undefined],[undefined,'/conditions.json']] as const){const r=await invoke(env,cli);assert(!r.success&&r.text.includes('Usage: export-course.ts')&&!r.text.includes('ambiguous'),'Явный единственный input отвергнут до usage');}
});
