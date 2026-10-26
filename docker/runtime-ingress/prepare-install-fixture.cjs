// Bundle the real installer and recovery policy for containers without workspace dependencies.
const fs = require('node:fs')
const path = require('node:path')
const esbuild = require('esbuild')

module.exports = async function prepareInstallFixture(root, dir) {
  fs.writeFileSync(
    path.join(dir, 'config.cjs'),
    `exports.getConfig = () => ({
    assetOptions: { serverRoot: '/fixture' },
    pluginInstallationOptions: { timeoutMs: 20000, lockWaitMs: 30000 }
  })`
  )
  fs.writeFileSync(
    path.join(dir, 'scope.cjs'),
    `module.exports = {
    GLOBAL_ORGANIZATION_SCOPE: 'global', SYSTEM_GLOBAL_SCOPE: 'system:global',
    TENANT_GLOBAL_SCOPE_PREFIX: 'tenant:', TENANT_GLOBAL_SCOPE_SUFFIX: ':global',
    getTenantGlobalScopeKey: id => 'tenant:' + id + ':global',
    isTenantGlobalScopeKey: value => typeof value === 'string' && value.startsWith('tenant:') && value.endsWith(':global')
  }`
  )
  await esbuild.build({
    entryPoints: {
      registry: path.join(root, 'packages/server/src/plugin/organization-plugin.store.ts'),
      recovery: path.join(root, 'packages/server/src/runtime-control/runtime-execution-recovery.ts')
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    outdir: dir,
    outExtension: { '.js': '.cjs' },
    alias: {
      '@xpert-ai/server-config': path.join(dir, 'config.cjs'),
      '@xpert-ai/plugin-sdk': path.join(dir, 'scope.cjs'),
      '@xpert-ai/contracts': path.join(root, 'packages/contracts/src/ai/mcp-execution-control.schema.ts')
    }
  })
  fs.mkdirSync(path.join(dir, 'bin'))
  fs.copyFileSync(
    path.join(root, 'packages/server/src/plugin/installation/fake-npm.test-fixture.cjs'),
    path.join(dir, 'bin/npm')
  )
  fs.chmodSync(path.join(dir, 'bin/npm'), 0o755)
}
