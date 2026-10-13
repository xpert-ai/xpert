const test = require('node:test')
const assert = require('node:assert/strict')
const { projectTemplateReadiness } = require('../electron/template-readiness.cjs')
class ClientError extends Error {}
test('requirements crossing Electron contain paths, versions and statuses without source contents', () => {
  const result = projectTemplateReadiness(
    {
      legacy: false,
      canInstall: false,
      manifestVersion: '1.0',
      checks: [
        { kind: 'plugin', key: 'test', status: 'missing', required: true, message: 'Missing', rootDir: '/private' }
      ],
      dependencies: [{ pluginName: 'test', version: '1.0', components: [], configuration: 'secret' }],
      files: { scope: 'user', entries: [{ kind: 'file', path: 'notes.md', version: '1', content: 'secret' }] },
      export_data: 'secret'
    },
    ClientError
  )
  assert.equal(result.canInstall, false)
  assert.equal(result.files.entries[0].path, 'notes.md')
  assert.doesNotMatch(JSON.stringify(result), /secret|private|export_data|configuration/)
})
test('legacy servers remain compatible; unknown statuses fail closed', () => {
  assert.equal(projectTemplateReadiness(undefined, ClientError), undefined)
  assert.throws(() =>
    projectTemplateReadiness(
      {
        legacy: false,
        canInstall: true,
        checks: [{ kind: 'plugin', key: 'test', status: 'invented', required: true }],
        dependencies: []
      },
      ClientError
    )
  )
})

test('Assistant capabilities and provider locks have an explicit public projection', () => {
  const capabilities = {
    agents: [
      {
        key: 'primary',
        label: 'Office',
        middleware: [{ provider: 'SandboxFile', toolNames: ['sandbox_read_file'], options: { secret: true } }]
      }
    ],
    skills: [{ pluginName: 'office', componentKey: 'ledger', targetAgentKey: 'primary', rootDir: '/private' }],
    seedMemoryCount: 1,
    sandbox: true,
    memories: [{ value: 'secret' }]
  }
  const result = projectTemplateReadiness(
    {
      legacy: false,
      canInstall: true,
      checks: [],
      capabilities,
      dependencies: [
        {
          pluginName: 'office',
          version: '1',
          components: [],
          providers: [{ kind: 'middleware', key: 'SandboxFile', rootDir: '/private' }]
        }
      ]
    },
    ClientError
  )
  assert.deepEqual(result.capabilities.agents[0].middleware, [
    { provider: 'SandboxFile', toolNames: ['sandbox_read_file'] }
  ])
  assert.equal(result.capabilities.skills.length, 1)
  assert.equal(result.capabilities.seedMemoryCount, 1)
  assert.deepEqual(result.dependencies[0].providers, [{ kind: 'middleware', key: 'SandboxFile' }])
  assert.doesNotMatch(JSON.stringify(result), /secret|private|rootDir|options|memories/)
  assert.throws(
    () =>
      projectTemplateReadiness(
        {
          legacy: false,
          canInstall: true,
          checks: [],
          dependencies: [],
          capabilities: { ...capabilities, seedMemoryCount: -1 }
        },
        ClientError
      ),
    ClientError
  )
})
