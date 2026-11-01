import { join, resolve } from 'node:path'
import { config as loadDotenv } from 'dotenv'

jest.mock('dotenv', () => ({ config: jest.fn() }))
jest.mock('./database', () => ({ dbConnectionConfig: { type: 'postgres' } }))

describe('Runtime path configuration boundary', () => {
  const previousEnvironment = process.env

  beforeEach(() => {
    process.env = { ...previousEnvironment, IS_DOCKER: 'true' }
    for (const key of ['DOTENV_CONFIG_PATH', 'XPERT_DATA_PATH', 'XPERT_PUBLIC_PATH', 'XPERT_PLUGIN_PATH']) {
      delete process.env[key]
    }
    jest.clearAllMocks()
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

  it('retains packaged Docker paths when overrides are absent', () => {
    expect(loadConfig().getConfig().assetOptions).toMatchObject({
      serverRoot: '/srv/xpert/',
      assetPath: '/srv/xpert/assets',
      assetPublicPath: '/srv/xpert/public',
      dataPath: '/var/lib/xpert/data/',
      pluginPath: undefined
    })
    expect(loadDotenv).toHaveBeenCalledWith({ path: '.env' })
  })

  it.each(['production', 'development'])('retains the %s defaults outside Docker', (mode) => {
    process.env.IS_DOCKER = 'false'
    process.env.NODE_ENV = mode
    const assets = loadConfig().getConfig().assetOptions
    const root = mode === 'production' ? process.cwd() : resolve(__dirname, '../../..')
    expect(assets.serverRoot).toBe(root)
    expect(assets.dataPath).toBe(mode === 'production' ? '/var/lib/xpert/data/' : join(root, 'tmp', 'data/'))
    expect(assets.pluginPath).toBeUndefined()
  })

  it('normalizes writable path overrides while preserving packaged asset locations', () => {
    process.env.DOTENV_CONFIG_PATH = '/test/config/.env'
    process.env.XPERT_DATA_PATH = 'isolated/data'
    process.env.XPERT_PUBLIC_PATH = '/isolated/public'
    process.env.XPERT_PLUGIN_PATH = 'isolated/plugins'
    const { getConfig } = loadConfig()
    expect(getConfig().assetOptions).toMatchObject({
      serverRoot: '/srv/xpert/',
      assetPath: '/srv/xpert/assets',
      dataPath: resolve('isolated/data'),
      assetPublicPath: '/isolated/public',
      pluginPath: resolve('isolated/plugins')
    })
    expect(loadDotenv).toHaveBeenCalledWith({ path: '/test/config/.env' })
    process.env.XPERT_PLUGIN_PATH = '/changed-after-bootstrap'
    expect(getConfig().assetOptions.pluginPath).toBe(resolve('isolated/plugins'))
  })
})
