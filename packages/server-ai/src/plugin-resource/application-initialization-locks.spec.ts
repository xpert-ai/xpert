import { ConflictException } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { ApplicationInitializationLocks } from './application-initialization-locks'

function fixture() {
    const database = new DataSource({ type: 'postgres' })
    const connection = database.createQueryRunner()
    jest.spyOn(database, 'createQueryRunner').mockReturnValue(connection)
    jest.spyOn(connection, 'connect').mockResolvedValue(undefined)
    const query = jest.spyOn(connection, 'query').mockResolvedValue([{ locked: true }])
    const release = jest.spyOn(connection, 'release').mockResolvedValue(undefined)
    return { locks: new ApplicationInitializationLocks(database), query, release }
}

describe('Application initialization lock lifecycle', () => {
    afterEach(() => jest.restoreAllMocks())

    it('holds the session lock until the asynchronous operation completes', async () => {
        const { locks, query, release } = fixture()
        const result = await locks.run('installation', async () => {
            await Promise.resolve()
            expect(query).toHaveBeenCalledTimes(1)
            expect(release).not.toHaveBeenCalled()
            return 'ready'
        })

        expect(result).toBe('ready')
        expect(query).toHaveBeenNthCalledWith(
            1,
            'SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked',
            ['application-initialize:installation']
        )
        expect(query).toHaveBeenNthCalledWith(
            2,
            'SELECT pg_advisory_unlock(hashtextextended($1, 0))',
            ['application-initialize:installation']
        )
        expect(release).toHaveBeenCalledTimes(1)
    })

    it('rejects concurrent work without running it or releasing another session lock', async () => {
        const { locks, query, release } = fixture()
        query.mockResolvedValueOnce([{ locked: false }])
        const action = jest.fn()

        await expect(locks.run('busy-installation', action)).rejects.toBeInstanceOf(ConflictException)

        expect(action).not.toHaveBeenCalled()
        expect(query).toHaveBeenCalledTimes(1)
        expect(release).toHaveBeenCalledTimes(1)
    })

    it('releases the acquired lock and connection when initialization fails', async () => {
        const { locks, query, release } = fixture()
        const error = new Error('initialization failed')

        await expect(locks.run('installation', async () => { throw error })).rejects.toBe(error)

        expect(query).toHaveBeenCalledTimes(2)
        expect(release).toHaveBeenCalledTimes(1)
    })

    it('releases the connection without running work when lock acquisition fails', async () => {
        const { locks, query, release } = fixture()
        const error = new Error('database unavailable')
        query.mockRejectedValueOnce(error)
        const action = jest.fn()

        await expect(locks.run('installation', action)).rejects.toBe(error)

        expect(action).not.toHaveBeenCalled()
        expect(query).toHaveBeenCalledTimes(1)
        expect(release).toHaveBeenCalledTimes(1)
    })
})
