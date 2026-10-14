jest.mock('typeorm', () => ({ DataSource: jest.fn() }))
import { DataSource } from 'typeorm'
import { TemplateInstallationLocks } from './template-installation-locks'

describe('dedicated installation lock pool', () => {
    it('initializes one bounded pool with no schema mutations and destroys it at shutdown', async () => {
        const connection = { initialize: jest.fn(), destroy: jest.fn(), isInitialized: true }
        connection.initialize.mockResolvedValue(connection)
        jest.mocked(DataSource).mockImplementation(() => connection as unknown as DataSource)
        const main = {
            options: {
                type: 'postgres',
                synchronize: true,
                migrationsRun: true,
                dropSchema: true,
                entities: ['existing'],
                extra: { max: 10, ssl: false }
            }
        } as unknown as DataSource
        const locks = new TemplateInstallationLocks(main)
        const values = await Promise.all(Array.from({ length: 12 }, () => locks.databaseForExecution()))
        expect(values.every((value) => value === values[0])).toBe(true)
        expect(connection.initialize).toHaveBeenCalledTimes(1)
        expect(DataSource).toHaveBeenLastCalledWith(
            expect.objectContaining({
                synchronize: false,
                migrationsRun: false,
                dropSchema: false,
                entities: [],
                migrations: [],
                subscribers: [],
                poolSize: 4,
                extra: { max: 4, ssl: false }
            })
        )
        await locks.onModuleDestroy()
        expect(connection.destroy).toHaveBeenCalledTimes(1)
    })
    it('allows initialization to retry after a connection failure', async () => {
        const connection = { initialize: jest.fn() }
        connection.initialize.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(connection)
        jest.mocked(DataSource).mockImplementation(() => connection as unknown as DataSource)
        const locks = new TemplateInstallationLocks({ options: { type: 'postgres' } } as DataSource)
        await expect(locks.databaseForExecution()).rejects.toThrow('offline')
        await expect(locks.databaseForExecution()).resolves.toBe(connection)
        expect(connection.initialize).toHaveBeenCalledTimes(2)
    })
})
