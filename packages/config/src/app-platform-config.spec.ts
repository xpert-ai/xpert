import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readAppPlatformConfig } from './app-platform-config'

describe('App Platform configuration loading', () => {
  let directory: string
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'app-platform-config-'))
  })
  afterEach(() => rmSync(directory, { recursive: true, force: true }))
  const product = {
    schemaVersion: 1,
    key: 'test-platform',
    version: 1,
    branding: { name: 'Test' },
    registration: { role: 'APP_USER', organization: 'per-account' },
    apps: [
      {
        key: 'app',
        appRef: { pluginName: '@test/plugin', appName: 'app' },
        required: true,
        configurationRef: 'default'
      }
    ],
    experience: { home: 'app', navigation: ['app'] },
    entitlements: { defaultPlanRef: 'trial' }
  }
  const deployment = {
    schemaVersion: 1,
    configurations: { default: { primary: { provider: 'test-provider', model: 'test-model' } } },
    plans: { trial: { trialDays: 7, creditLimit: 100, maxProjects: 3, maxUploadBytes: 10485760, maxConcurrentRuns: 2 } }
  }
  function files(environment: object = deployment) {
    const env = {
      APP_PLATFORM_FILE: join(directory, 'platform.yaml'),
      APP_PLATFORM_ENVIRONMENT_FILE: join(directory, 'environment.yaml')
    }
    writeFileSync(env.APP_PLATFORM_FILE, JSON.stringify(product))
    writeFileSync(env.APP_PLATFORM_ENVIRONMENT_FILE, JSON.stringify(environment))
    return env
  }
  it('preserves ordinary deployments without configuration', () => expect(readAppPlatformConfig({})).toBeNull())
  it('loads a deterministic version snapshot without secrets', () => {
    const env = files()
    expect(readAppPlatformConfig(env)).toEqual(readAppPlatformConfig(env))
    expect(readAppPlatformConfig(env)?.digest).toMatch(/^[a-f0-9]{64}$/)
  })
  it('rejects missing references and credentials rather than partially loading', () => {
    expect(() => readAppPlatformConfig(files({ ...deployment, configurations: {} }))).toThrow('Invalid App Platform')
    expect(() => readAppPlatformConfig(files({ ...deployment, password: 'sensitive-fixture' }))).toThrow(
      'Invalid App Platform'
    )
  })
  it('requires both files and rejects YAML aliases', () => {
    expect(() => readAppPlatformConfig({ APP_PLATFORM_FILE: 'file' })).toThrow('Both App Platform')
    const env = files()
    writeFileSync(env.APP_PLATFORM_FILE, 'value: &value [one]\ncopy: *value\n')
    expect(() => readAppPlatformConfig(env)).toThrow('Invalid App Platform')
  })
  it('rejects the removed per-App monetary quota instead of silently ignoring it', () => {
    expect(() => readAppPlatformConfig(files({ ...deployment, plans: { trial: {
      ...deployment.plans.trial, appCreditLimits: { app: 10 }
    } } }))).toThrow('Invalid App Platform')
  })
})
