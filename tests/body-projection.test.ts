import {renderPublicBody} from '../_extensions/course-prairielearn/application/export.ts';
Deno.test('native body omits bibliographic nodes and preserves code brackets and useful author links',async()=>{
 const nodes:any[]=[{t:'Para',c:[{t:'Str',c:'PUBLIC_WORDS'},{t:'Space'},{t:'Cite',c:[[{citationId:'book',citationPrefix:[],citationSuffix:[],citationMode:{t:'NormalCitation'},citationNoteNum:0,citationHash:0}],[{t:'Str',c:'BIBLIOGRAPHIC_ONLY'}]]},{t:'Space'},{t:'Code',c:[['',[],[]],'array[i]']},{t:'Space'},{t:'Str',c:'[literal]'},{t:'Space'},{t:'Link',c:[['',[],[]],[{t:'Str',c:'AUTHOR_LINK'}],['https://example.org/guide','']]}]},{t:'Div',c:[['refs',['references','csl-bib-body'],[]],[{t:'Para',c:[{t:'Str',c:'BIBLIOGRAPHY_BLOCK'}]}]]}];
 const before=JSON.stringify(nodes),result=await renderPublicBody({owner:'fixture',apiVersion:[1,23,1],resources:[]},nodes,'fixture/exr-test',{owner:'fixture',id:'exr-test'} as any,'resources','{{options.client_files_question_url}}');
 if(result.html.includes('BIBLIOGRAPH')||!['PUBLIC_WORDS','array[i]','[literal]','AUTHOR_LINK','https://example.org/guide'].every(s=>result.html.includes(s)))throw Error('Native bibliographic projection changed useful condition');
 if(JSON.stringify(nodes)!==before)throw Error('Projection mutated canonical authored AST');
});
