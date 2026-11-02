import { appPlatformDefinitionSchema, appPlatformEnvironmentSchema } from '@xpert-ai/contracts'
import { platformConfigurationSnapshotSchema } from './platform-configuration-snapshot'
import { platformAppStateSchema } from './app-platform-delivery.entity'
import { appPlatformJobSchema } from './app-platform-job.schema'

const app = { key: 'main', required: true, configurationRef: 'default', appRef: { pluginName: 'plugin', appName: 'app' } }
const optional = { ...app, key: 'optional', required: false, appRef: { pluginName: 'plugin', appName: 'optional' } }
const definition = {
  schemaVersion: 1, key: 'platform', version: 1, branding: { name: 'Test' },
  registration: { role: 'APP_USER', organization: 'per-account' }, apps: [app, optional],
  experience: { home: 'main', navigation: ['main', 'optional'] }, entitlements: { defaultPlanRef: 'trial' }
}
const environment = appPlatformEnvironmentSchema.parse({ schemaVersion: 1,
  configurations: { default: { primary: { provider: 'provider', model: 'model' } } },
  plans: { trial: { trialDays: 7, creditLimit: 100, maxProjects: 10, maxUploadBytes: 1000, maxConcurrentRuns: 2 } }
})
const snapshot = { definition, environment, digest: 'a'.repeat(64) }

describe('persisted application delivery contracts', () => {
  it('reads current definitions with defaults', () => {
    const result = platformConfigurationSnapshotSchema.parse(snapshot)
    expect(result.definition).toEqual(appPlatformDefinitionSchema.parse(definition))
    expect(result.definition.apps[0].enabled).toBe(true)
  })

  it.each([{ entries: [] }, { entries: ['assistant'] }, { entries: ['role:writer'] }])('migrates legacy entry selection $entries to whole-App availability', ({ entries }) => {
    const result = platformConfigurationSnapshotSchema.parse({ ...snapshot,
      definition: { ...definition, apps: [app, { ...optional, entries }] } })
    expect(result.definition.apps[1].enabled).toBe(entries.length > 0)
    expect(result.definition.apps[1]).not.toHaveProperty('entries')
    expect(appPlatformDefinitionSchema.safeParse({ ...definition, apps: [app, { ...optional, entries }] }).success).toBe(false)
  })

  it('preserves an explicit disabled state when reading old entries', () => {
    const result = platformConfigurationSnapshotSchema.parse({ ...snapshot,
      definition: { ...definition, apps: [app, { ...optional, enabled: false, entries: ['assistant'] }] } })
    expect(result.definition.apps[1].enabled).toBe(false)
  })

  it('rejects corrupt persistence and extra job fields at the boundary', () => {
    expect(platformConfigurationSnapshotSchema.safeParse({ ...snapshot, digest: 'invalid' }).success).toBe(false)
    expect(platformAppStateSchema.safeParse({ key: 'main', status: 'ready', installationId: 'invalid' }).success).toBe(false)
    expect(platformAppStateSchema.safeParse({ key: 'main', status: 'ready', attempts: -1 }).success).toBe(false)
    const job = { deliveryId: '00000000-0000-4000-8000-000000000001', digest: snapshot.digest }
    expect(appPlatformJobSchema.parse(job)).toEqual(job)
    expect(appPlatformJobSchema.safeParse({ ...job, userId: 'untrusted' }).success).toBe(false)
    expect(appPlatformJobSchema.safeParse({ ...job, digest: 'invalid' }).success).toBe(false)
  })
})
