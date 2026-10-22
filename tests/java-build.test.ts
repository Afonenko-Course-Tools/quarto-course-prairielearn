import {runtimeDescriptor} from '../_extensions/course-prairielearn/application/runtime-descriptor.ts';
import {selectedSources,hash} from '../_extensions/course-prairielearn/application/source-selection.ts';
const assert=(v:unknown,m:string)=>{if(!v)throw Error(m);};
const build={kind:'gradle-jar-v1','main-class':'grade.Main',artifact:'gradeapp.jar'};
const check={runtime:'java25-gradle-junit-v1',sourceProfile:{mode:'implementation',root:'student/src/main/java'},'java-build':build};
const profile={mode:'implementation',javaRelease:25};
function rejected(fn:()=>unknown){let denied=false;try{fn();}catch{denied=true;}assert(denied,'invalid native build descriptor accepted');}
Deno.test('native Gradle descriptor carries closed build record and preserves independent Java API/extras',()=>{
 const value:any=runtimeDescriptor({...check,'api-precheck':{files:['tests/Api.java'],entry:'grade.Api'},'additional-java-sources':{archive:'extra.zip','max-files':1,'max-file-bytes':100,'max-total-bytes':100,'max-archive-bytes':100}},profile,['grade/Main.java'],['Api.java','Checks.java'],{files:['Api.java'],entry:'grade.Api'});
 assert(JSON.stringify(value.javaBuild)===JSON.stringify({kind:'gradle-jar-v1',mainClass:'grade.Main',artifact:'gradeapp.jar'}),'descriptor dropped or changed javaBuild');
 assert(value.apiPrecheck?.entry==='grade.Api'&&value.additionalJavaSources?.archive==='extra.zip','native Java API/extras lost');
 assert(JSON.stringify(value.sourceFiles)==='["grade/Main.java"]'&&JSON.stringify(value.testFiles)==='["Api.java","Checks.java"]','build changed source/test selection');
});
Deno.test('native Gradle descriptors fail closed on absent records unknown recipes fields names runtime and mutation',()=>{
 for(const patch of [{'java-build':undefined},{'java-build':null},{'java-build':{...build,command:'run'}},{'java-build':{...build,kind:'unknown'}},{'java-build':{kind:'gradle-jar-v1',artifact:'gradeapp.jar'}},{runtime:'java25-junit-v1'},{runtime:'java25-junit-mutation-v1'},{runtime:'fish-git-v1'},{sourceProfile:{...check.sourceProfile,mode:'student-tests'}}])rejected(()=>runtimeDescriptor({...check,...patch},profile,['Main.java'],['Checks.java']));
 for(const artifact of ['../x.jar','/x.jar','.hidden.jar','x/y.jar','x\\y.jar','C:x.jar','x*.jar','x?.jar','x..jar','x.zip','a'.repeat(102)+'.jar','x\n.jar'])rejected(()=>runtimeDescriptor({...check,'java-build':{...build,artifact}},profile,['Main.java'],['Checks.java']));
 for(const main of ['grade..Main','.Main','grade.Main.','9Main','grade/Main','grade.Main\n'])rejected(()=>runtimeDescriptor({...check,'java-build':{...build,'main-class':main}},profile,['Main.java'],['Checks.java']));
 for(const p of [{mode:'implementation',sourceExtensions:['.fish']},{mode:'student-tests',javaRelease:25},{mode:'implementation',javaRelease:21},{mode:'implementation',javaRelease:25,sourceExtensions:['.java','.gradle']}])rejected(()=>runtimeDescriptor(check,p,['Main.java'],['Checks.java']));
 const legacy=runtimeDescriptor({runtime:'java25-junit-v1',sourceProfile:{mode:'implementation'}},profile,['Main.java'],['Checks.java']);assert(!('javaBuild'in legacy),'plain Java acquired native build');
 const fish=runtimeDescriptor({runtime:'fish-git-v1',sourceProfile:{mode:'implementation'}},{sourceExtensions:['.fish']},['main.fish'],['checks.py']);assert(!('javaBuild'in fish)&&!('java'in fish),'fish acquired Java build');
});
Deno.test('native Gradle selection rejects scripts artifacts public tests and invalid coupling before payload',async()=>{
 const root=await Deno.makeTempDir({prefix:'pl-native-gradle-'});
 try{
  const name='student/src/main/java/grade/Main.java',bytes=new TextEncoder().encode('package grade; class Main {}');await Deno.mkdir(root+'/student/src/main/java/grade',{recursive:true});await Deno.writeFile(root+'/'+name,bytes);
  const source={projectRelativePath:name,submissionRelativePath:'grade/Main.java',sha256:await hash(bytes)};
  const fact={check,sources:[source]};const selected=await selectedSources(root,fact,profile);assert(selected.length===1&&selected[0].name==='grade/Main.java','native selected source lost');
  for(const bad of [
   {...fact,check:{...check,'java-build':undefined}},
   {...fact,check:{...check,runtime:'java25-junit-v1'}},
   {...fact,sources:[{...source,submissionRelativePath:'build.gradle'}]},
   {...fact,sources:[{...source,submissionRelativePath:'gradeapp.jar'}]},
   {...fact,check:{...check,sourceProfile:{mode:'implementation',root:'student/src/test/java'}},sources:[{...source,projectRelativePath:'student/src/test/java/Main.java',submissionRelativePath:'Main.java'}]},
  ]){let denied=false;try{await selectedSources(root,bad,profile);}catch{denied=true;}assert(denied,'native payload admitted invalid source/coupling');}
 }finally{await Deno.remove(root,{recursive:true});}
});
Deno.test('Java API capability accepts only the two explicit implementation runtimes',()=>{
 const api={files:['Api.java'],entry:'Api'};
 const c={runtime:'custom-java-v1',sourceProfile:{mode:'implementation'},'api-precheck':{files:['tests/Api.java'],entry:'Api'}};
 rejected(()=>runtimeDescriptor(c,profile,['Main.java'],['Api.java','Checks.java'],api));
 const plain=runtimeDescriptor({...c,runtime:'java25-junit-v1'},profile,['Main.java'],['Api.java','Checks.java'],api);
 assert(plain.apiPrecheck?.entry==='Api','plain Java API capability lost');
});
