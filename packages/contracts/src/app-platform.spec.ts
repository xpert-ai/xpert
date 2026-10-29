import { appPlatformAppOrder, appPlatformDefinitionSchema } from './app-platform'

const app = (key: string, required = true, pluginName = '@test/apps') => ({
  key,
  required,
  appRef: { pluginName, appName: key },
  configurationRef: 'default'
})
const definition = () => ({
  schemaVersion: 1,
  key: 'example',
  version: 1,
  branding: { name: 'Example' },
  registration: { role: 'APP_USER', organization: 'per-account' },
  apps: [app('primary')],
  experience: { home: 'primary', navigation: ['primary'] },
  entitlements: { defaultPlanRef: 'trial' }
})

describe('App Platform composition boundary', () => {
  it('orders explicit dependencies across the same and different plugins', () => {
    const parsed = appPlatformDefinitionSchema.parse({
      ...definition(),
      apps: [
        { ...app('primary'), dependsOn: ['library'] },
        { ...app('optional', false, '@test/second'), dependsOn: ['library'] },
        app('library')
      ],
      bindings: [
        {
          type: 'knowledgebase',
          from: { app: 'library', resource: 'documents' },
          to: { app: 'primary', resource: 'reference' }
        }
      ]
    })
    expect(appPlatformAppOrder(parsed).map((item) => item.key)).toEqual(['library', 'primary', 'optional'])
  })
  it.each([
    { apps: [{ ...app('primary'), entries: ['assistant'] }] },
    { apps: [{ ...app('primary'), enabled: false }] },
    { apps: [{ ...app('primary'), dependsOn: ['library'] }, { ...app('library'), enabled: false }] },
    { apps: [app('primary'), { ...app('alias'), appRef: app('primary').appRef }] },
    { apps: [app('primary'), app('primary')] },
    { apps: [{ ...app('primary'), dependsOn: ['missing'] }] },
    { apps: [{ ...app('primary'), dependsOn: ['primary'] }] },
    {
      apps: [
        { ...app('primary'), dependsOn: ['second'] },
        { ...app('second'), dependsOn: ['primary'] }
      ]
    },
    { apps: [{ ...app('primary'), dependsOn: ['optional'] }, app('optional', false)] },
    { experience: { home: 'missing', navigation: ['primary'] } },
    { experience: { home: 'primary', navigation: ['missing'] } },
    { experience: { home: 'primary', navigation: ['primary', 'primary'] } },
    { apps: [app('primary', false)] },
    { registration: { role: 'ADMIN', organization: 'per-account' } },
    { tenantId: 'client-chosen' },
    {
      bindings: [
        { type: 'knowledgebase', from: { app: 'primary', resource: 'docs' }, to: { app: 'primary', resource: 'docs' } }
      ]
    }
  ])('rejects invalid or authority-bearing composition %#', (override) => {
    expect(appPlatformDefinitionSchema.safeParse({ ...definition(), ...override }).success).toBe(false)
  })
  it('configures whole-App availability without repeating Assistant template lists', () => {
    const parsed = appPlatformDefinitionSchema.parse({ ...definition(), apps: [app('primary'), { ...app('optional', false), enabled: false }] })
    expect(parsed.apps[0].enabled).toBe(true)
    expect(parsed.apps[1].enabled).toBe(false)
    expect(parsed.apps[0]).not.toHaveProperty('entries')
  })
  it('rejects resource binding without explicit dependency and unknown resource kinds', () => {
    for (const type of ['knowledgebase', 'arbitrary']) {
      expect(
        appPlatformDefinitionSchema.safeParse({
          ...definition(),
          apps: [app('primary'), app('library')],
          bindings: [
            { type, from: { app: 'library', resource: 'docs' }, to: { app: 'primary', resource: 'reference' } }
          ]
        }).success
      ).toBe(false)
    }
  })
})
