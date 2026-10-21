// Внутренняя закрытая граница captured Core check → Platform descriptor.
export interface JavaBuild {kind:"gradle-jar-v1";mainClass:string;artifact:string}
export function javaBuild(check:any,profile?:{mode?:string;javaRelease?:number;sourceExtensions?:string[]}):JavaBuild|undefined {
 const value=check['java-build'],native=check.runtime==='java25-gradle-junit-v1';
 if(native&&value===undefined)throw Error('PL native Gradle runtime requires java-build');
 if(value===undefined)return undefined;
 if(!native||check.sourceProfile?.mode!=='implementation'||!profile||profile.mode!=='implementation'||profile.javaRelease!==25||profile.sourceExtensions!==undefined&&(!Array.isArray(profile.sourceExtensions)||profile.sourceExtensions.length!==1||profile.sourceExtensions[0]!=='.java')||!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==3||Object.keys(value).some(k=>!['kind','main-class','artifact'].includes(k))||value.kind!=='gradle-jar-v1'||typeof value['main-class']!=='string'||!/^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/.test(value['main-class'])||typeof value.artifact!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,100}\.jar$/.test(value.artifact))throw Error('PL java-build requires a closed native Gradle implementation record/profile');
 return {kind:value.kind,mainClass:value['main-class'],artifact:value.artifact};
}
