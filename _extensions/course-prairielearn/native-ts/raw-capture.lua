local directory=pandoc.path.directory(debug.getinfo(1,'S').source:sub(2))
local function plain(value)
 local kind=pandoc.utils.type(value)
 if kind=='Inlines' or kind=='Blocks' then local text=pandoc.utils.stringify(value);return text=='' and pandoc.json.null or text end
 if type(value)~='table' then return value end
 local result=kind=='List' and pandoc.List() or {}
 for key,child in pairs(value)do result[key]=plain(child)end
 return result
end
return {{Pandoc=function(doc)
 if pandoc.utils.stringify(doc.meta['course-core-runtime'] or '')~='native-ts' then return doc end
 local active=false;for _,name in ipairs(doc.meta.course and doc.meta.course.adapters or {})do if pandoc.utils.stringify(name)=='prairielearn' then active=true end end
 if not active then return doc end
 assert(doc.meta['course-core-processed']==nil,'PL.CAPTURE_AFTER_PROJECTION: raw filter должен предшествовать Core')
 local root=assert(quarto.project.directory)
 local input=quarto.doc.input_file
 if pandoc.path.is_relative(input)then input=pandoc.path.join({root,input})end
 local source=pandoc.path.make_relative(input,root)
 local declarations=pandoc.List()
 doc:walk({Div=function(div)
  if div.identifier:match('^exr%-')then
   local attributes={};for key,value in pairs(div.attributes)do attributes[key]=value end
   local declaration={id=div.identifier,attributes=attributes}
   if div.attributes.answer or div.attributes['answer-spec'] or div.attributes.correct then declaration.answer=true end
   div:walk({CodeBlock=function(block)if block.classes:includes('answer-spec')then declaration.answer=true end end,Div=function(block)if block.classes:includes('answer')then declaration.answer=true end end})
   declarations:insert(declaration)
  end
 end})
 local value={declarations=declarations}
 if doc.meta.prairielearn~=nil then value.config=plain(doc.meta.prairielearn)end
 local native=quarto.format.format_identifier()
 local format=native['target-format']
 assert((format=='html' or format=='revealjs') and native['base-format']==format,'PL.CAPTURE_FORMAT: требуется exact html/revealjs')
 if doc.meta.assessment and doc.meta.assessment.prairielearn~=nil then value.assessment=plain(doc.meta.assessment.prairielearn)end
 if doc.meta['project-checks']~=nil then value.projectChecks=plain(doc.meta['project-checks'])end
 if doc.meta['project-materialization']~=nil then value.materialization=plain(doc.meta['project-materialization'])end
 pandoc.pipe(os.getenv('QUARTO') or 'quarto',{'run',directory..'/capture.ts',root,source,format},pandoc.json.encode(value))
 return doc
end}}
