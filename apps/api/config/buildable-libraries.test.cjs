const assert = require('node:assert/strict')
const { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { dirname, join } = require('node:path')
const { test } = require('node:test')
const ts = require('typescript')
const { withBuiltLibraries } = require('./buildable-libraries.cjs')

test('the API checks dependency declarations while retaining its own type errors', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'api-built-libraries-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const write = (name, data) => {
    const file = join(root, name)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data))
  }
  write('tsconfig.json', { compilerOptions: { baseUrl: '.', paths: { '@test/lib': ['packages/lib/index.ts'] } } })
  write('apps/api/tsconfig.json', { extends: '../../tsconfig.json', compilerOptions: { types: [] }, include: ['*.ts'] })
  write(
    'apps/api/index.ts',
    "import { value } from '@test/lib'; import { direct } from '@test/direct'; const invalid: string = value; direct()"
  )
  write('packages/lib/package.json', { name: '@test/lib' })
  write('packages/lib/index.ts', 'export const value: number = "broken source must not be recompiled"')
  write('dist/lib/package.json', { name: '@test/lib', main: 'index.js', types: 'index.d.ts' })
  write('dist/lib/index.d.ts', 'export declare const value: number')
  write('dist/lib/index.js', 'exports.value = 1')
  write('packages/direct/package.json', { name: '@test/direct', main: 'index.js', types: 'index.d.ts' })
  write('packages/direct/index.js', 'exports.direct = () => 1')
  write('packages/direct/index.d.ts', 'export declare function direct(): number')
  const graph = {
    nodes: {
      api: { type: 'app', name: 'api', data: { root: 'apps/api', targets: {} } },
      lib: {
        type: 'lib',
        name: 'lib',
        data: {
          root: 'packages/lib',
          targets: {
            build: { executor: '@nx/js:tsc', outputs: ['{workspaceRoot}/dist/lib'] }
          }
        }
      },
      direct: { type: 'lib', name: 'direct', data: { root: 'packages/direct', targets: {} } }
    },
    dependencies: {
      api: ['lib', 'direct'].map((target) => ({ source: 'api', target, type: 'static' })),
      lib: [],
      direct: []
    },
    externalNodes: {}
  }
  const options = { tsConfig: 'apps/api/tsconfig.json', buildLibsFromSource: false }
  withBuiltLibraries({}, { options, context: { root, projectName: 'api', projectGraph: graph } })
  const json = ts.readConfigFile(options.tsConfig, ts.sys.readFile).config
  const parsed = ts.parseJsonConfigFileContent(json, ts.sys, dirname(options.tsConfig))
  const program = ts.createProgram(parsed.fileNames, parsed.options)
  assert.ok(program.getSourceFile(join(root, 'dist/lib/index.d.ts')))
  assert.ok(program.getSourceFile(join(root, 'packages/direct/index.d.ts')))
  assert.equal(program.getSourceFile(join(root, 'packages/lib/index.ts')), undefined)
  const errors = program.getSemanticDiagnostics().filter((error) => error.file?.fileName.endsWith('apps/api/index.ts'))
  assert.equal(errors.length, 1)
  assert.equal(errors[0].code, 2322)
  assert.deepEqual(JSON.parse(readFileSync(join(root, 'tsconfig.json'))).compilerOptions.paths['@test/lib'], [
    'packages/lib/index.ts'
  ])
})

test('explicit source builds keep the original TypeScript configuration', () => {
  const options = { tsConfig: 'apps/api/tsconfig.app.json', buildLibsFromSource: true }
  withBuiltLibraries({}, { options, context: {} })
  assert.equal(options.tsConfig, 'apps/api/tsconfig.app.json')
})
