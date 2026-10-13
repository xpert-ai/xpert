const ts = require('typescript')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const source = readFileSync(join(__dirname, '../../../../libs/template-installation/client.ts'), 'utf8')
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText
new Function('exports', code)(module.exports)
