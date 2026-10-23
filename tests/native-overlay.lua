-- Проверка только writer enrollment; полную capability доказывает installed test.
local extension = assert(os.getenv('EXPORTER_EXTENSION'))
package.path = extension .. '/?.lua;' .. package.path
local native = require('native')
return {{Pandoc=function(doc)
  pandoc.system.with_temporary_directory('pl-overlay-',function(root)
    local profile='course-export-11111111-1111-4111-8111-111111111111'
    local runDir=root..'/_generated/course-spec/native-runs/11111111-1111-4111-8111-111111111111'
    local overlay={kind='owned-config-overlay-v1',sourceContext={sha1=pandoc.utils.sha1('{}'),sha256=string.rep('a',64)}}
    local witness={schema='course-common-files-path-binding-v2',projectRoot=root,runDirectory=runDir,profiles={profile},outputDirectory=root..'/_site',renderAll=true,quartoVersion='1.11.5',ownerInspectionHash=string.rep('a',64),documentInspectionHashes={},configurationInputs={},inputFiles={'index.qmd'},sourceHashes={},commonSourceHashes={},canonicalOwnerDeclarations={},documents={},nativeExtensionMetadata={},metadataClosure={},sourceIdentities={},ownedConfigOverlay=overlay,sourceInspectionRefs={'source-ref'},forcedWriter={kind='owned-export-json'},temporaryExportProfile={profile=profile,file='_quarto-'..profile..'.yml',sha1=string.rep('a',40),sha256=string.rep('a',64)}}
    local run={schema='course-native-run-pointer-v3',projectRoot=root,directory=runDir,profiles={profile},outputDirectory=root..'/_site',renderAll=true,configurationHashes={},ownedConfigOverlay=overlay,overlayState='active'}
    local function write(path,bytes) local f=assert(io.open(path,'wb'));f:write(bytes);f:close() end
    local function copy(v) return pandoc.json.decode(pandoc.json.encode(v)) end
    local function attempt(mutate,expected,label)
      pandoc.system.make_directory(runDir,true)
      local r,w=copy(run),copy(witness)
      local meta={course={id='overlay-test',view='full'},['course-export-context']=true,['course-current-native-run']=true}
      quarto={project={directory=root,profile={profile},output_directory=root..'/_site'},doc={input_file='index.qmd',output_file='index.json'}}
      FORMAT='json'
      write(runDir..'/owned-export-source-context.json','{}')
      os.remove(runDir..'/native-run.json');os.remove(runDir..'/owned-export-restored-entry.json')
      if mutate then mutate(r,w,meta,write,runDir) end
      local bytes=pandoc.json.encode(w)
      r.commonPathBinding=r.commonPathBinding or {file='common-files-path-binding.json',sha1=pandoc.utils.sha1(bytes),sha256=string.rep('b',64)}
      write(runDir..'/common-files-path-binding.json',bytes)
      write(root..'/_generated/course-spec/active-native-run.json',pandoc.json.encode(r))
      local ok,err=pcall(native.write,{meta=meta},{source='index.qmd',exercises=pandoc.List()})
      assert(ok==expected,label..': '..tostring(err))
      if not expected then assert(tostring(err):find('PL.NATIVE_INVALID',1,true),label..': неверная диагностика') end
      print((expected and 'PASS ' or 'REFUSED ')..label)
    end
    attempt(nil,true,'active-v3 до позднего course-core-processed')
    local cases={
      {'schema',function(r) r.schema='course-native-run-pointer-v4' end},
      {'owner',function(r) r.projectRoot=root..'/other' end},
      {'directory',function(r) r.directory=root..'/outside' end},
      {'traversal',function(r) r.directory=runDir..'/../escape' end},
      {'profile order',function(r) r.profiles={profile,'full'} end},
      {'unknown pointer key',function(r) r.extra=true end},
      {'restored',function(r) r.overlayState='restored' end},
      {'active restoration ref',function(r) r.ownedConfigRestoration={} end},
      {'completed',function(_,_,_,put,d) put(d..'/native-run.json','{}') end},
      {'restoration slot',function(_,_,_,put,d) put(d..'/owned-export-restored-entry.json','{}') end},
      {'overlay kind',function(r) r.ownedConfigOverlay.kind='unknown' end},
      {'overlay key',function(r) r.ownedConfigOverlay.file='elsewhere' end},
      {'source-context hash',function(r) r.ownedConfigOverlay.sourceContext.sha1=string.rep('c',40) end},
      {'source-context absent',function(_,_,_,_,d) os.remove(d..'/owned-export-source-context.json') end},
      {'witness ref',function(r) r.commonPathBinding={file='other.json',sha1=string.rep('a',40),sha256=string.rep('a',64)} end},
      {'witness hash',function(r) r.commonPathBinding={file='common-files-path-binding.json',sha1=string.rep('a',40),sha256=string.rep('a',64)} end},
      {'witness version',function(_,w) w.schema='course-common-files-path-binding-v1' end},
      {'witness overlay',function(_,w) w.ownedConfigOverlay.sourceContext.sha256=string.rep('c',64) end},
      {'witness unknown key',function(_,w) w.extra=true end},
      {'witness owner',function(_,w) w.projectRoot=root..'/other' end},
      {'witness profile',function(_,w) w.profiles={'full'} end},
      {'no current Core marker',function(_,_,m) m['course-current-native-run']=nil end},
      {'no export context',function(_,_,m) m['course-export-context']=nil end},
      {'student view',function(_,_,m) m.course.view='student' end},
      {'non-json writer',function() FORMAT='html' end},
    }
    for _,case in ipairs(cases) do attempt(case[2],false,case[1]) end
    attempt(function(r) r.schema='course-native-run-pointer-v2';r.ownedConfigOverlay=nil;r.overlayState=nil end,true,'legacy-v2')
  end)
  return doc
end}}
