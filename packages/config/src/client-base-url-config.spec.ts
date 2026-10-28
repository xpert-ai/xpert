jest.mock('dotenv', () => ({ config: jest.fn() }))
jest.mock('dotenv/config', () => ({}))
jest.mock('./database', () => ({ dbConnectionConfig: { type: 'postgres' } }))

describe('shared Cloud URL configuration', () => {
  const previousEnvironment = process.env

  beforeEach(() => {
    process.env = { ...previousEnvironment }
    delete process.env.CLIENT_BASE_URL
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

  it.each(['development', 'production'])('uses the existing local default in %s', (mode) => {
    process.env.NODE_ENV = mode
    expect(loadConfig().getConfig().clientBaseUrl).toBe('http://localhost:4200')
  })

  it.each(['development', 'production'])('honors CLIENT_BASE_URL and bootstrap overrides in %s', (mode) => {
    process.env.NODE_ENV = mode
    process.env.CLIENT_BASE_URL = 'https://cloud.example'
    const { getConfig, setConfig, resetConfig } = loadConfig()
    expect(getConfig().clientBaseUrl).toBe('https://cloud.example')
    setConfig({ clientBaseUrl: 'https://configured.example' })
    expect(getConfig().clientBaseUrl).toBe('https://configured.example')
    resetConfig()
    expect(getConfig().clientBaseUrl).toBe('https://cloud.example')
  })
})
