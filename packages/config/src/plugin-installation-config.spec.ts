import { readPluginInstallationConfig } from './plugin-installation-config'

describe('Plugin installation configuration boundary', () => {
  it('defaults to a bounded install and bounded shared-store wait', () => {
    expect(readPluginInstallationConfig({})).toEqual({ timeoutMs: 120_000, lockWaitMs: 180_000 })
  })
  it('maps valid environment settings', () => {
    expect(
      readPluginInstallationConfig({ PLUGIN_INSTALL_TIMEOUT_MS: '60000', PLUGIN_INSTALL_LOCK_WAIT_MS: '90000' })
    ).toEqual({ timeoutMs: 60_000, lockWaitMs: 90_000 })
  })
  it.each(['0', '-1', 'NaN', '1000.5', '600001'])('bounds invalid deadlines: %s', (value) => {
    expect(
      readPluginInstallationConfig({ PLUGIN_INSTALL_TIMEOUT_MS: value, PLUGIN_INSTALL_LOCK_WAIT_MS: value })
    ).toEqual({ timeoutMs: 120_000, lockWaitMs: 180_000 })
  })
})
