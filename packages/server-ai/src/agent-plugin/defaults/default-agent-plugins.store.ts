// Progress is scoped by tenant and organization, without persisting request credentials.
// A short control lock serializes job creation; a separate session lock owns the worker.
// Process exit releases the worker lock so an authenticated resume can recover the receipt.
import { Injectable } from '@nestjs/common'
import { TenantSetting } from '@xpert-ai/server-core'
import type { DefaultAgentPluginsImportProgress } from '@xpert-ai/contracts'
import { DataSource, type EntityManager } from 'typeorm'
import { v5 as uuid } from 'uuid'
import type { AgentPluginScope } from '../agent-plugin-scope'
import { defaultAgentPluginsProgress } from './default-agent-plugins.schema'

@Injectable()
export class DefaultAgentPluginsStore {
    constructor(private readonly database: DataSource) {}

    private key(scope: AgentPluginScope) {
        return `xpert:agent-plugin-defaults:${scope.tenantId}:${scope.organizationId}`
    }

    async control<T>(scope: AgentPluginScope, work: (manager: EntityManager) => Promise<T>): Promise<T> {
        // Waiting requests must not occupy every pooled connection while the lock owner needs another.
        return this.database.transaction(async (manager) => {
            await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${this.key(scope)}:control`])
            return work(manager)
        })
    }

    acquire(scope: AgentPluginScope) {
        return this.lock(this.key(scope))
    }

    private async lock(key: string): Promise<{ manager: EntityManager; release(): Promise<void> } | null> {
        const connection = this.database.createQueryRunner()
        try {
            await connection.connect()
            const rows: { acquired: boolean }[] = await connection.query(
                'SELECT pg_try_advisory_lock(hashtext($1)) AS acquired',
                [key]
            )
            if (!rows[0]?.acquired) {
                await connection.release()
                return null
            }
        } catch (error) {
            await connection.release()
            throw error
        }
        return {
            manager: connection.manager,
            release: async () => {
                try {
                    await connection.query('SELECT pg_advisory_unlock(hashtext($1))', [key])
                } finally {
                    await connection.release()
                }
            }
        }
    }

    async read(
        scope: AgentPluginScope,
        manager: EntityManager = this.database.manager
    ): Promise<DefaultAgentPluginsImportProgress> {
        const row = await manager.getRepository(TenantSetting).findOneBy({
            id: uuid(this.key(scope), uuid.URL),
            tenantId: scope.tenantId
        })
        return row?.value
            ? (defaultAgentPluginsProgress.parse(JSON.parse(row.value)) as DefaultAgentPluginsImportProgress)
            : {
                  operationId: null,
                  phase: 'idle',
                  commit: null,
                  total: 0,
                  currentId: null,
                  items: [],
                  updatedAt: new Date().toISOString()
              }
    }

    async save(
        scope: AgentPluginScope,
        progress: DefaultAgentPluginsImportProgress,
        manager: EntityManager = this.database.manager
    ) {
        progress.updatedAt = new Date().toISOString()
        await manager.getRepository(TenantSetting).save({
            id: uuid(this.key(scope), uuid.URL),
            tenantId: scope.tenantId,
            name: 'defaultAgentPluginImport',
            value: JSON.stringify(progress)
        })
    }
}
