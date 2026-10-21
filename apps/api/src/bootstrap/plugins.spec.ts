import { Logger } from '@nestjs/common'
import { getConfig, setConfig } from '@xpert-ai/server-config'
import {
  getEntitiesFromPlugins,
  loadOrganizationPluginConfigs,
  PluginStartupTimeoutError,
  registerPluginsAsync
} from '@xpert-ai/server-core'
import { GLOBAL_ORGANIZATION_SCOPE, SYSTEM_GLOBAL_SCOPE } from '@xpert-ai/plugin-sdk'
import { preBootstrapPlugins } from './index'

jest.mock('@xpert-ai/server-config', () => ({ getConfig: jest.fn(), setConfig: jest.fn() }), { virtual: true })
jest.mock('@xpert-ai/contracts', () => ({}), { virtual: true })
jest.mock('@xpert-ai/server-ai', () => ({}), { virtual: true })
jest.mock(
  '@xpert-ai/server-core',
  () => ({
    loadOrganizationPluginConfigs: jest.fn(),
    selectPluginStartup: (groups: unknown) => groups,
    PluginStartupTimeoutError: class extends Error {},
    registerPluginsAsync: jest.fn(),
    getEntitiesFromPlugins: jest.fn(() => []),
    normalizePluginName: (name: string) => (name.lastIndexOf('@') > 0 ? name.slice(0, name.lastIndexOf('@')) : name)
  }),
  { virtual: true }
)
jest.mock(
  '@xpert-ai/plugin-sdk',
  () => ({
    GLOBAL_ORGANIZATION_SCOPE: 'global',
    SYSTEM_GLOBAL_SCOPE: 'system:global'
  }),
  { virtual: true }
)
jest.mock('./bootstrap.module', () => ({}))
jest.mock('./session', () => ({}))
jest.mock('chalk', () => ({}))

const pluginName = '@xpert-ai/plugin-local-shell-sandbox'
const loadConfigs = jest.mocked(loadOrganizationPluginConfigs)
const register = jest.mocked(registerPluginsAsync)

describe('preBootstrapPlugins local shell opt-in', () => {
  const originalEnabled = process.env.XPERT_LOCAL_SANDBOX_ENABLED
  const originalPlugins = process.env.PLUGINS

  beforeEach(() => {
    jest.clearAllMocks()
    delete process.env.XPERT_LOCAL_SANDBOX_ENABLED
    delete process.env.PLUGINS
    jest.mocked(getConfig).mockReturnValue({ dbConnectionOptions: { entities: [] } } as ReturnType<typeof getConfig>)
    loadConfigs.mockResolvedValue([])
    register.mockResolvedValue({
      modules: [],
      errors: [],
      organizationId: 'global',
      scopeKey: 'global',
      tenantId: null
    })
  })

  afterEach(() => {
    if (originalEnabled === undefined) delete process.env.XPERT_LOCAL_SANDBOX_ENABLED
    else process.env.XPERT_LOCAL_SANDBOX_ENABLED = originalEnabled
    if (originalPlugins === undefined) delete process.env.PLUGINS
    else process.env.PLUGINS = originalPlugins
    jest.restoreAllMocks()
  })

  it.each([undefined, '', 'false', '1'])('does not enable host shell implicitly for %s', async (value) => {
    if (value !== undefined) process.env.XPERT_LOCAL_SANDBOX_ENABLED = value
    await preBootstrapPlugins()
    expect(register.mock.calls.flatMap(([group]) => group.plugins).some((plugin) => plugin.name === pluginName)).toBe(
      false
    )
  })

  it.each(['true', ' TRUE '])('registers the opted-in workspace plugin only in system scope for %s', async (value) => {
    process.env.XPERT_LOCAL_SANDBOX_ENABLED = value
    process.env.PLUGINS = `${pluginName},${pluginName}@0.2.0`
    await preBootstrapPlugins()
    const registrations = register.mock.calls.flatMap(([group]) =>
      group.plugins
        .filter((plugin) => plugin.name === pluginName)
        .map((plugin) => ({ scopeKey: group.scopeKey, ...plugin }))
    )
    expect(registrations).toEqual([
      { scopeKey: SYSTEM_GLOBAL_SCOPE, name: pluginName, source: 'code', level: 'system' }
    ])
    expect(setConfig).toHaveBeenCalled()
  })

  it('preserves the installed system package and its saved configuration', async () => {
    process.env.XPERT_LOCAL_SANDBOX_ENABLED = 'true'
    const installed = {
      name: pluginName,
      source: 'code',
      level: 'system' as const,
      sourceConfig: { workspacePath: '/installed/local-shell' }
    }
    const configs = { [pluginName]: {} }
    loadConfigs.mockResolvedValue([
      {
        organizationId: GLOBAL_ORGANIZATION_SCOPE,
        scopeKey: SYSTEM_GLOBAL_SCOPE,
        plugins: [installed],
        configs
      }
    ])
    await preBootstrapPlugins()
    const system = register.mock.calls.find(([group]) => group.scopeKey === SYSTEM_GLOBAL_SCOPE)?.[0]
    expect(system.plugins.filter((plugin) => plugin.name === pluginName)).toEqual([installed])
    expect(system.configs).toBe(configs)
  })

  it('keeps API bootstrap available when the plugin registration group fails', async () => {
    process.env.XPERT_LOCAL_SANDBOX_ENABLED = 'true'
    jest.spyOn(console, 'error').mockImplementation(() => undefined)
    jest.spyOn(Logger, 'error').mockImplementation(() => undefined)
    register.mockRejectedValueOnce(new Error('Optional package is missing'))
    await expect(preBootstrapPlugins()).resolves.toBeUndefined()
    expect(setConfig).toHaveBeenCalled()
  })

  it('keeps successful modules and entities when individual plugins fail during schema preparation', async () => {
    class CoreEntity {}
    class WorkingPluginEntity {}
    class WorkingPluginModule {}
    const modules = [{ module: WorkingPluginModule }]
    jest.mocked(getConfig).mockReturnValue({
      ...getConfig(),
      dbConnectionOptions: { type: 'postgres', entities: [CoreEntity] }
    })
    jest.mocked(getEntitiesFromPlugins).mockReturnValueOnce([WorkingPluginEntity])
    register.mockResolvedValueOnce({
      modules,
      organizationId: 'global',
      scopeKey: 'system:global',
      tenantId: null,
      errors: [
        { organizationId: 'global', pluginName: '@fixture/missing', error: 'Cannot find module' },
        {
          organizationId: 'global',
          pluginName: '@fixture/invalid',
          error: 'Module does not export a valid XpertPlugin'
        }
      ]
    })
    await expect(preBootstrapPlugins({ failOnPluginGroupError: true })).resolves.toBeUndefined()
    expect(register).toHaveBeenCalledTimes(2)
    expect(getEntitiesFromPlugins).toHaveBeenCalledWith(modules)
    expect(setConfig).toHaveBeenCalledWith({
      plugins: modules,
      dbConnectionOptions: { autoLoadEntities: true, entities: [CoreEntity, WorkingPluginEntity] }
    })
  })

  it('propagates a failed registration group before schema migration', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined)
    jest.spyOn(Logger, 'error').mockImplementation(() => undefined)
    register.mockRejectedValueOnce(new Error('Plugin discovery failed'))
    await expect(preBootstrapPlugins({ failOnPluginGroupError: true })).rejects.toThrow('Plugin discovery failed')
    expect(setConfig).not.toHaveBeenCalled()
  })

  it('does not migrate when the persisted plugin list cannot be read', async () => {
    loadConfigs.mockRejectedValueOnce(new Error('Plugin configuration database is unavailable'))
    await expect(preBootstrapPlugins({ failOnPluginGroupError: true })).rejects.toThrow(
      'Plugin configuration database is unavailable'
    )
    expect(register).not.toHaveBeenCalled()
    expect(setConfig).not.toHaveBeenCalled()
  })

  it.each([false, true])('keeps startup timeouts fatal with strict groups = %s', async (failOnPluginGroupError) => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined)
    jest.spyOn(Logger, 'error').mockImplementation(() => undefined)
    const error = new PluginStartupTimeoutError('Plugin registration timed out')
    register.mockRejectedValueOnce(error)
    await expect(preBootstrapPlugins({ failOnPluginGroupError })).rejects.toBe(error)
    expect(setConfig).not.toHaveBeenCalled()
  })
})
