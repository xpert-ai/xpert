import { signal } from '@angular/core'
import type { IPluginDescriptor, IPluginLatestVersionStatus } from '@xpert-ai/contracts'
import { PluginVersionChecks, pluginVersionCheckKey } from './plugin-version-checks'

const plugin: IPluginDescriptor = {
  name: '@test/plugin',
  scopeKey: 'system:global',
  organizationId: 'global',
  meta: { name: '@test/plugin', version: '0.4.0' },
  level: 'system',
  isGlobal: true,
  effectiveInCurrentScope: true,
  canUpdate: true
}
const latest: IPluginLatestVersionStatus = {
  name: plugin.name,
  scopeKey: plugin.scopeKey,
  organizationId: 'global',
  hasUpdate: true,
  latestVersion: '0.5.1',
  check: {
    status: 'success',
    checkedAt: '2026-11-05T10:00:00Z',
    lastSuccessfulCheckAt: '2026-11-05T10:00:00Z',
    latestVersion: '0.5.1'
  }
}

describe('PluginVersionChecks', () => {
  it('discards a response after a scope change even when the plugin has the same name', async () => {
    let resolveRequest!: (statuses: IPluginLatestVersionStatus[]) => void
    const fetchVersions = jest.fn(
      () =>
        new Promise<IPluginLatestVersionStatus[]>((resolve) => {
          resolveRequest = resolve
        })
    )
    const plugins = signal([plugin])
    const checks = new PluginVersionChecks(plugins, fetchVersions)
    const request = checks.load([plugin.name])
    checks.reset()
    plugins.set([{ ...plugin, scopeKey: 'tenant:other:global', currentVersion: '1.0.0' }])
    resolveRequest([latest])
    await request
    expect(checks.states()).toEqual({})
    expect(plugins()[0].hasUpdate).toBeUndefined()
    expect(plugins()[0].currentVersion).toBe('1.0.0')
  })

  it('forces a manual retry, preserves the last successful result and hides stale update actions on failure', async () => {
    const fetchVersions = jest
      .fn<Promise<IPluginLatestVersionStatus[]>, [string[], boolean]>()
      .mockResolvedValueOnce([latest])
      .mockRejectedValueOnce(new Error('network failure'))
    const plugins = signal([plugin])
    const checks = new PluginVersionChecks(plugins, fetchVersions)
    await checks.load([plugin.name])
    expect(plugins()[0].hasUpdate).toBe(true)
    await checks.check(plugins()[0])
    expect(fetchVersions).toHaveBeenLastCalledWith([plugin.name], true)
    expect(checks.states()[pluginVersionCheckKey(plugin)].result).toMatchObject({
      status: 'failed',
      latestVersion: '0.5.1',
      lastSuccessfulCheckAt: latest.check?.checkedAt
    })
    expect(plugins()[0].hasUpdate).toBe(false)
  })

  it('does not query archives or pending installs, or mix system and tenant instances with the same name', async () => {
    const tenant = { ...plugin, scopeKey: 'tenant:other:global', canUpdate: false }
    const archive: IPluginDescriptor = {
      ...plugin,
      name: '@test/archive',
      canUpdate: false,
      updateUnavailableReason: 'archive'
    }
    const pending: IPluginDescriptor = { ...plugin, name: '@test/pending', updateUnavailableReason: 'pending_restart' }
    const plugins = signal([plugin, tenant, archive, pending])
    const fetchVersions = jest.fn(async () => [latest])
    const checks = new PluginVersionChecks(plugins, fetchVersions)
    await checks.check(archive)
    await checks.check(pending)
    expect(fetchVersions).not.toHaveBeenCalled()
    await checks.load(plugins().map((item) => item.name))
    expect(fetchVersions).toHaveBeenCalledWith([plugin.name], false)
    expect(plugins()[0].hasUpdate).toBe(true)
    expect(plugins()[1].hasUpdate).toBeUndefined()
  })
})
