// The receipt contains source identity only, never credentials. A session lock owns a resumable worker.
import { Injectable } from '@nestjs/common'
import { TenantSetting } from '@xpert-ai/server-core'
import type { AgentPluginUpdateProgress } from '@xpert-ai/contracts'
import { DataSource, type EntityManager } from 'typeorm'
import { v5 as uuid } from 'uuid'
import type { AgentPluginScope } from '../agent-plugin-scope'
import { lockPackageScope } from './package-storage'
import { updateProgressSchema } from './agent-plugin-maintenance.schema'

@Injectable()
export class AgentPluginUpdateStore {
    constructor(private readonly database: DataSource) {}
    private key(scope: AgentPluginScope) {
        return `agent-plugin-update:${scope.tenantId}:${scope.organizationId}`
    }
    async control<T>(scope: AgentPluginScope, work: (manager: EntityManager) => Promise<T>) {
        return this.database.transaction(async (manager) => {
            await lockPackageScope(manager, scope)
            return work(manager)
        })
    }
    async acquire(scope: AgentPluginScope): Promise<{ manager: EntityManager; release(): Promise<void> } | null> {
        const runner = this.database.createQueryRunner()
        const key = this.key(scope)
        try {
            await runner.connect()
            const rows: { acquired: boolean }[] = await runner.query(
                'SELECT pg_try_advisory_lock(hashtext($1)) AS acquired',
                [key]
            )
            if (!rows[0]?.acquired) {
                await runner.release()
                return null
            }
        } catch (error) {
            await runner.release()
            throw error
        }
        return {
            manager: runner.manager,
            release: async () => {
                try {
                    await runner.query('SELECT pg_advisory_unlock(hashtext($1))', [key])
                } finally {
                    await runner.release()
                }
            }
        }
    }
    async read(
        scope: AgentPluginScope,
        manager: EntityManager = this.database.manager
    ): Promise<AgentPluginUpdateProgress> {
        const row = await manager
            .getRepository(TenantSetting)
            .findOneBy({ id: uuid(this.key(scope), uuid.URL), tenantId: scope.tenantId })
        return row?.value
            ? (updateProgressSchema.parse(JSON.parse(row.value)) as AgentPluginUpdateProgress)
            : {
                  operationId: null,
                  packageId: null,
                  branch: null,
                  commit: null,
                  phase: 'idle'
              }
    }
    async save(
        scope: AgentPluginScope,
        progress: AgentPluginUpdateProgress,
        manager: EntityManager = this.database.manager
    ) {
        await manager.getRepository(TenantSetting).save({
            id: uuid(this.key(scope), uuid.URL),
            tenantId: scope.tenantId,
            name: 'agentPluginUpdate',
            value: JSON.stringify(updateProgressSchema.parse(progress))
        })
    }
}
