import { appPlatformDefinitionSchema } from '@xpert-ai/contracts'
import { platformAppAvailable, platformNeedsProvision, platformReady, reconcilePlatformApps } from './platform-delivery-state'

const definition = appPlatformDefinitionSchema.parse({
  schemaVersion: 1, key: 'test', version: 1, branding: { name: 'Test' },
  registration: { role: 'APP_USER', organization: 'per-account' },
  apps: ['primary', 'optional'].map(key => ({ key, required: key === 'primary', appRef: { pluginName: '@test/plugin', appName: key }, configurationRef: 'default' })),
  experience: { home: 'primary', navigation: ['primary', 'optional'] }, entitlements: { defaultPlanRef: 'trial' }
})
describe('platform delivery state', () => {
  it('keeps a previously applied App available during recovery but never after removal', () => {
    const state = { key: 'primary', status: 'failed' as const, attempts: 1, appliedDigest: 'a'.repeat(64) }
    expect(platformAppAvailable(state)).toBe(true)
    expect(platformNeedsProvision([state])).toBe(true)
    expect(platformAppAvailable({ ...state, status: 'disabled' })).toBe(false)
    expect(platformNeedsProvision([{ ...state, status: 'disabled' }])).toBe(false)
    expect(platformAppAvailable({ key: 'primary', status: 'failed', attempts: 1 })).toBe(false)
    expect(platformAppAvailable(undefined)).toBe(false)
  })
  it('keeps optional failure local while required failure prevents readiness', () => {
    expect(platformReady(definition, [{ key: 'primary', status: 'ready', attempts: 1 }, { key: 'optional', status: 'failed', attempts: 1 }])).toBe(true)
    expect(platformReady(definition, [{ key: 'primary', status: 'failed', attempts: 1 }, { key: 'optional', status: 'ready', attempts: 1 }])).toBe(false)
    expect(platformReady(definition, [])).toBe(false)
  })
  it('retains installation identities when entries are removed and restored', () => {
    const old = [{ key: 'removed', status: 'ready' as const, attempts: 1, installationId: '00000000-0000-4000-8000-000000000001' }]
    const reconciled = reconcilePlatformApps(definition, old)
    expect(reconciled.find(item => item.key === 'removed')).toEqual({ ...old[0], status: 'disabled' })
    expect(reconciled.filter(item => item.status === 'pending')).toHaveLength(2)
  })
  it('disables and restores the entire App while retaining its installation identity', () => {
    const old = [{ key: 'optional', status: 'ready' as const, attempts: 1, installationId: '00000000-0000-4000-8000-000000000001' }]
    const disabled = { ...definition, apps: definition.apps.map(app => ({ ...app, enabled: app.key !== 'optional' })) }
    const states = reconcilePlatformApps(disabled, old)
    expect(states.find(state => state.key === 'optional')).toEqual({ ...old[0], status: 'disabled' })
    expect(reconcilePlatformApps(definition, states).find(state => state.key === 'optional'))
      .toEqual({ ...old[0], status: 'pending' })
  })
})
