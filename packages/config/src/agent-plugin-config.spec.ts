import { join } from 'node:path'

jest.mock('dotenv', () => ({ config: jest.fn() }))
jest.mock('./database', () => ({ dbConnectionConfig: { type: 'postgres' } }))

describe('Agent Plugin configuration', () => {
  const previousEnvironment = process.env

  beforeEach(() => {
    process.env = { ...previousEnvironment, IS_DOCKER: 'true' }
    delete process.env.XPERT_AGENT_PLUGIN_PATH
    jest.spyOn(console, 'log').mockImplementation(() => undefined)
  })
  afterEach(() => {
    process.env = previousEnvironment
    jest.restoreAllMocks()
  })

  function loadConfig() {
    let config: typeof import('./config-manager')
    jest.isolateModules(() => {
      config = jest.requireActual<typeof import('./config-manager')>('./config-manager')
    })
    return config
  }

  it.each([undefined, ''])('keeps the dataPath default when the environment value is %p', (value) => {
    if (value !== undefined) process.env.XPERT_AGENT_PLUGIN_PATH = value
    const { getConfig } = loadConfig()
    expect(getConfig().assetOptions.agentPluginPath).toBeUndefined()
    expect(join(getConfig().assetOptions.dataPath, 'agent-plugins')).toBe('/var/lib/xpert/data/agent-plugins')
  })

  it.each(['/external/agent-plugins', 'custom-agent-plugins'])('maps the environment override %p', (value) => {
    process.env.XPERT_AGENT_PLUGIN_PATH = value
    const { getConfig } = loadConfig()
    expect(getConfig().assetOptions.agentPluginPath).toBe(value)
    process.env.XPERT_AGENT_PLUGIN_PATH = '/changed-after-bootstrap'
    expect(getConfig().assetOptions.agentPluginPath).toBe(value)
  })

  it('preserves the environment mapping when bootstrap provides dataPath and allows typed overrides', () => {
    process.env.XPERT_AGENT_PLUGIN_PATH = '/environment/plugins'
    const { getConfig, setConfig, resetConfig } = loadConfig()
    const originalAssets = getConfig().assetOptions
    setConfig({ assetOptions: { ...originalAssets, dataPath: '/custom/data' } })
    expect(getConfig().assetOptions.agentPluginPath).toBe('/environment/plugins')
    setConfig({ assetOptions: { ...getConfig().assetOptions, agentPluginPath: '/configured/plugins' } })
    expect(getConfig().assetOptions.agentPluginPath).toBe('/configured/plugins')
    resetConfig()
    expect(getConfig().assetOptions).toEqual(originalAssets)
  })
})
