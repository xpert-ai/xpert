import type { DataSource, InsertEvent, QueryRunner, TransactionCommitEvent, TransactionRollbackEvent } from 'typeorm'
import type { RuntimeResourceCatalogCache } from './runtime-catalog.cache'
import { RuntimeCatalogSubscriber } from './runtime-catalog.subscriber'

describe('runtime catalog invalidation', () => {
    const invalidate = jest.fn(async () => undefined)
    const database = { subscribers: [] }
    let subscriber: RuntimeCatalogSubscriber
    beforeEach(() => {
        invalidate.mockClear()
        subscriber = new RuntimeCatalogSubscriber(
            database as unknown as DataSource,
            { invalidate } as unknown as RuntimeResourceCatalogCache
        )
    })
    const change = (tableName: string, queryRunner: { isTransactionActive: boolean }) =>
        ({ metadata: { tableName }, queryRunner }) as InsertEvent<unknown>

    it('invalidates catalog and authorization dependencies without requiring entity instances', async () => {
        for (const table of [
            'agent_resource_binding',
            'xpert_workspace_member',
            'user_group_to_user',
            'role_permission',
            'plugin_instance'
        ]) {
            await subscriber.afterInsert(change(table, { isTransactionActive: false }))
        }
        expect(invalidate).toHaveBeenCalledTimes(5)
        await subscriber.afterInsert(change('chat_message', { isTransactionActive: false }))
        expect(invalidate).toHaveBeenCalledTimes(5)
    })

    it('invalidates once after commit and does not expose uncommitted or rolled-back changes', async () => {
        const runner = { isTransactionActive: true }
        await subscriber.afterInsert(change('agent_plugin_package', runner))
        await subscriber.afterInsert(change('xpert', runner))
        const event = { queryRunner: runner as QueryRunner } as TransactionCommitEvent
        await subscriber.afterTransactionCommit(event)
        expect(invalidate).not.toHaveBeenCalled()
        runner.isTransactionActive = false
        await subscriber.afterTransactionCommit(event)
        expect(invalidate).toHaveBeenCalledTimes(1)
        runner.isTransactionActive = true
        await subscriber.afterInsert(change('xpert', runner))
        runner.isTransactionActive = false
        subscriber.afterTransactionRollback(event as TransactionRollbackEvent)
        await subscriber.afterTransactionCommit(event)
        expect(invalidate).toHaveBeenCalledTimes(1)
    })
})
