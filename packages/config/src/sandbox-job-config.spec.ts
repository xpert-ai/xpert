jest.mock('dotenv', () => ({ config: jest.fn() }))
jest.mock('./database', () => ({ dbConnectionConfig: { type: 'postgres' } }))
// Load the real config helpers without pulling unrelated UI protocol barrels into this boundary test.
jest.mock('@xpert-ai/server-common', () => ({
  ...jest.requireActual('../../common/src/constants'),
  ...jest.requireActual('../../common/src/utils/deep-merge')
}))

describe('Sandbox job configuration boundary', () => {
  const environment = process.env
  beforeEach(() => {
    process.env = { ...environment }
    for (const key of [
      'SANDBOX_JOB_GLOBAL_LIMIT',
      'SANDBOX_JOB_TENANT_LIMIT',
      'SANDBOX_JOB_USER_LIMIT',
      'SANDBOX_JOB_CAPACITY_POLL_MS'
    ])
      delete process.env[key]
    jest.spyOn(console, 'log').mockImplementation(() => undefined)
  })
  afterEach(() => {
    process.env = environment
    jest.restoreAllMocks()
  })
  function config() {
    let result: typeof import('./config-manager')
    jest.isolateModules(() => {
      result = jest.requireActual<typeof import('./config-manager')>('./config-manager')
    })
    return result
  }
  it('maps defaults and reads typed bootstrap overrides without consulting later environment changes', () => {
    const { getConfig, setConfig } = config()
    expect(getConfig().sandboxJobOptions).toEqual({
      globalLimit: 20,
      tenantLimit: 4,
      userLimit: 2,
      capacityPollMs: 1000
    })
    process.env.SANDBOX_JOB_GLOBAL_LIMIT = '999'
    expect(getConfig().sandboxJobOptions.globalLimit).toBe(20)
    setConfig({ sandboxJobOptions: { globalLimit: 3, tenantLimit: 2, userLimit: 1, capacityPollMs: 500 } })
    expect(getConfig().sandboxJobOptions.globalLimit).toBe(3)
  })
  it('normalizes invalid limits and bounds polling at the configuration boundary', () => {
    process.env.SANDBOX_JOB_GLOBAL_LIMIT = '0.2'
    process.env.SANDBOX_JOB_TENANT_LIMIT = '-1'
    process.env.SANDBOX_JOB_USER_LIMIT = '3.7'
    process.env.SANDBOX_JOB_CAPACITY_POLL_MS = '5'
    expect(config().getConfig().sandboxJobOptions).toEqual({
      globalLimit: 20,
      tenantLimit: 4,
      userLimit: 3,
      capacityPollMs: 250
    })
  })
})
