import { DataSource } from 'typeorm'
import { DefaultAgentPluginsStore } from './default-agent-plugins.store'
jest.mock('@xpert-ai/server-core', () => ({ TenantSetting: class {} }))

describe('default import persistence and locks', () => {
    const connection = { connect: jest.fn(), query: jest.fn(), release: jest.fn() }
    const repository = { findOneBy: jest.fn(), save: jest.fn() }
    let store: DefaultAgentPluginsStore
    const scope = { tenantId: 'tenant', organizationId: 'org' }
    beforeEach(() => {
        jest.resetAllMocks()
        connection.query.mockResolvedValue([{ acquired: true }])
        store = new DefaultAgentPluginsStore({
            createQueryRunner: () => connection,
            getRepository: () => repository
        } as unknown as DataSource)
    })

    it('isolates tenant and organization receipts and validates stored progress', async () => {
        const initial = await store.read(scope)
        expect(initial.phase).toBe('idle')
        await store.read({ ...scope, organizationId: null })
        await store.read({ ...scope, organizationId: 'other' })
        await store.read({ ...scope, tenantId: 'other' })
        const keys = repository.findOneBy.mock.calls.map(([where]) => where.id)
        expect(new Set(keys).size).toBe(4)
        expect(repository.findOneBy).toHaveBeenNthCalledWith(1, { id: keys[0], tenantId: 'tenant' })
        await store.save(scope, initial)
        expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({ id: keys[0], tenantId: 'tenant' }))
        repository.findOneBy.mockResolvedValue({ value: JSON.stringify(initial) })
        expect(await store.read(scope)).toEqual(initial)
        repository.findOneBy.mockResolvedValue({ value: '{"phase":"unexpected"}' })
        await expect(store.read(scope)).rejects.toThrow()
    })

    it('uses a distinct short control lock and always releases it on failure', async () => {
        await expect(
            store.control(scope, async () => {
                throw new Error('write failed')
            })
        ).rejects.toThrow('write failed')
        expect(connection.query).toHaveBeenNthCalledWith(1, 'SELECT pg_advisory_lock(hashtext($1))', [
            'xpert:agent-plugin-defaults:tenant:org:control'
        ])
        expect(connection.query).toHaveBeenLastCalledWith('SELECT pg_advisory_unlock(hashtext($1))', [
            'xpert:agent-plugin-defaults:tenant:org:control'
        ])
        expect(connection.release).toHaveBeenCalledTimes(1)
    })

    it('shares the existing worker lock and does not unlock a lock held by another instance', async () => {
        connection.query.mockResolvedValueOnce([{ acquired: false }])
        expect(await store.acquire(scope)).toBeNull()
        expect(connection.query).toHaveBeenCalledTimes(1)
        const release = await store.acquire(scope)
        expect(connection.query).toHaveBeenLastCalledWith('SELECT pg_try_advisory_lock(hashtext($1)) AS acquired', [
            'xpert:agent-plugin-defaults:tenant:org'
        ])
        await release()
        expect(connection.release).toHaveBeenCalledTimes(2)
    })

    it('releases the query runner after connection or lock errors', async () => {
        connection.connect.mockRejectedValueOnce(new Error('connect'))
        await expect(store.acquire(scope)).rejects.toThrow('connect')
        expect(connection.release).toHaveBeenCalledTimes(1)
        connection.query.mockRejectedValueOnce(new Error('query'))
        await expect(store.acquire(scope)).rejects.toThrow('query')
        expect(connection.release).toHaveBeenCalledTimes(2)
    })
})
