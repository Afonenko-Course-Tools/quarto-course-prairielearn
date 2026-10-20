import {runtimeDescriptor} from '../_extensions/course-prairielearn/application/runtime-descriptor.ts';
const assert=(v:unknown,m:string)=>{if(!v)throw Error(m)};
Deno.test('only explicit closed public case declarations enter runtime descriptor',()=>{
 const c:any={runtime:'java25-junit-v1',sourceProfile:{mode:'implementation'},'public-cases':[{id:'normal',name:'Обычный результат операции',test:'Checks#normal',input:'2 3',expected:'5'},{id:'boundary',name:'Граничный случай операции',test:'Checks#boundary',input:'',expected:''}]};
 const result:any=runtimeDescriptor(c,{javaRelease:25},['Main.java'],['Checks.java']);assert(result.publicCases?.length===2&&result.publicCases[1].expected===''&&result.publicCases[1].name==='Граничный случай операции','public case not captured');
 for(const cases of [[{id:'missing-name',test:'Checks#x',input:'0',expected:'0'}],[{id:'x',test:'Checks#x',expected:'1'}],[{id:'x',test:'Checks#x',input:'1',expected:'1',private:true}],[c['public-cases'][0],c['public-cases'][0]]]){
  let refused=false;try{runtimeDescriptor({...c,'public-cases':cases},{javaRelease:25},['Main.java'],['Checks.java'])}catch{refused=true}assert(refused,'invalid or ambiguous public case accepted');
 }
 const no:any=runtimeDescriptor({runtime:'java25-junit-v1',sourceProfile:{mode:'implementation'}},{javaRelease:25},['Main.java'],['Checks.java']);assert(no.publicCases===undefined,'private default promoted');
});
