const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')
const { findImports, addedImports } = require('./check-request-context-imports.cjs')

test('recognizes multiline, aliased, type, namespace and CommonJS RequestContext imports', () => {
  const samples = [
    "import {\n Other,\n RequestContext as Context\n} from '@xpert-ai/server-core'",
    "import type { RequestContext } from '@xpert-ai/server-core'",
    "export { RequestContext as Context } from '@xpert-ai/server-core'",
    "import * as core from '@xpert-ai/server-core'; core.RequestContext.currentUser()",
    "import * as core from '@xpert-ai/server-core'; core['RequestContext'].currentUser()",
    "const { RequestContext: Context } = require('@xpert-ai/server-core')",
    "const core = require('@xpert-ai/server-core'); core.RequestContext.currentUser()",
    "const context = require('@xpert-ai/server-core/context').RequestContext"
  ]
  for (const source of samples) assert.equal(findImports(source, 'sample.ts').length, 1, source)
  assert.deepEqual(
    findImports(
      `
    // import { RequestContext } from '@xpert-ai/server-core'
    const example = "import { RequestContext } from '@xpert-ai/server-core'"
    import { RequestContext } from '@xpert-ai/plugin-sdk'
    import { Other } from '@xpert-ai/server-core'
  `,
      'sample.ts'
    ),
    []
  )
})

test('existing imports are grandfathered, but new bindings are checked', () => {
  const previous = "import { RequestContext } from '@xpert-ai/server-core'"
  assert.deepEqual(addedImports(previous, `\n${previous}\nconst extra = 1`, 'sample.ts'), [])
  assert.equal(addedImports("import { Other } from '@xpert-ai/server-core'", previous, 'sample.ts').length, 1)
  assert.equal(
    addedImports(previous, `${previous}\nimport { RequestContext as Added } from '@xpert-ai/server-core'`, 'sample.ts')
      .length,
    1
  )
})

test('the commit check reads staged blobs, handles spaces and renames, and leaves the index unchanged', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xpert-import-check-'))
  const script = path.join(__dirname, 'check-request-context-imports.cjs')
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  const write = (file, content) => fs.writeFileSync(path.join(root, file), content)
  const check = (...args) => spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: 'utf8' })
  const legacy = "import { RequestContext } from '@xpert-ai/server-core'\n"
  const sdk = "import { RequestContext } from '@xpert-ai/plugin-sdk'\n"
  try {
    git('init')
    git('config', 'user.name', 'Import checker test')
    git('config', 'user.email', 'test@example.invalid')
    git('config', 'core.hooksPath', path.join(root, 'no-hooks'))
    write('existing.ts', legacy)
    git('add', '.')
    git('commit', '-m', 'fixture')
    git('mv', 'existing.ts', 'renamed legacy.ts')
    assert.equal(check('--staged').status, 0)
    git('commit', '-m', 'rename fixture')

    write('new file.ts', legacy)
    git('add', 'new file.ts')
    write('new file.ts', sdk)
    const before = git('diff', '--cached', '--binary')
    const rejected = check('--staged')
    assert.equal(rejected.status, 1)
    assert.match(rejected.stderr, /new file\.ts:1:/)
    assert.equal(git('diff', '--cached', '--binary'), before)

    git('add', 'new file.ts')
    write('new file.ts', legacy)
    write('unstaged.ts', legacy)
    assert.equal(check('--staged').status, 0, 'Unstaged changes cannot affect the commit check')
    assert.equal(check().status, 1, 'The working tree check includes untracked files')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
