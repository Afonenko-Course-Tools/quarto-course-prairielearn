// Run with Node and installed ajv@8.17.1/esbuild@0.25.10. Schemas are pinned in provenance.json.
const fs = require('node:fs');
const path = require('node:path');
const Ajv = require('ajv');
const standalone = require('ajv/dist/standalone');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '../_extensions/course-prairielearn');
const ajv = new Ajv({strict:false,validateFormats:true,code:{source:true,esm:true},allErrors:true});
ajv.addFormat("uuid", /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const schemas = {};
for (const name of ['infoCourse','infoCourseInstance','infoAssessment','infoQuestion']) {
  ajv.addSchema(JSON.parse(fs.readFileSync(`${root}/spec/upstream/${name}.json`)), name);
  schemas[name] = name;
}
const source=path.join(require('node:os').tmpdir(),'course-pl-validators.mjs');
fs.writeFileSync(source,standalone.default(ajv,schemas));
esbuild.buildSync({stdin:{contents:fs.readFileSync(source,'utf8'),resolveDir:process.cwd(),sourcefile:'validators.mjs'},bundle:true,nodePaths:[path.dirname(path.dirname(path.dirname(require.resolve('ajv'))))],format:'esm',platform:'neutral',outfile:`${root}/application/native-validators.js`,minify:true});
fs.unlinkSync(source);
