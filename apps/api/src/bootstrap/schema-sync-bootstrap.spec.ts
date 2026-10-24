import { getConfig, setConfig } from '@xpert-ai/server-config'
import { withSchemaSyncProtection } from './schema-sync-bootstrap'

jest.mock('@xpert-ai/server-config', () => ({ getConfig: jest.fn(), setConfig: jest.fn() }), { virtual: true })

describe('plugin discovery schema protection', () => {
  const originalEnvironment = process.env.NODE_ENV
  afterEach(() => {
    if (originalEnvironment === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = originalEnvironment
    jest.clearAllMocks()
  })

  it.each(['development', 'production'])(
    'disables every initialization DDL option in %s and restores on error',
    async (env) => {
      process.env.NODE_ENV = env
      const connection = {
        type: 'postgres' as const,
        synchronize: true,
        migrationsRun: true,
        dropSchema: true,
        installExtensions: true
      }
      jest.mocked(getConfig).mockReturnValue({ dbConnectionOptions: connection } as ReturnType<typeof getConfig>)
      const error = new Error('plugin unavailable')
      await expect(
        withSchemaSyncProtection(async () => {
          expect(setConfig).toHaveBeenLastCalledWith({
            dbConnectionOptions: {
              synchronize: false,
              migrationsRun: false,
              dropSchema: false,
              installExtensions: false
            }
          })
          throw error
        })
      ).rejects.toBe(error)
      expect(setConfig).toHaveBeenLastCalledWith({
        dbConnectionOptions: {
          synchronize: true,
          migrationsRun: true,
          dropSchema: true,
          installExtensions: true
        }
      })
    }
  )
})
