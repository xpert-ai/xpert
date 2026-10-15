// Progress is scoped by tenant and organization, without persisting request credentials.
// A short control lock serializes job creation; a separate session lock owns the worker.
// Process exit releases the worker lock so an authenticated resume can recover the receipt.
import { Injectable } from '@nestjs/common'
import { TenantSetting } from '@xpert-ai/server-core'
import type { DefaultAgentPluginsImportProgress } from '@xpert-ai/contracts'
import { DataSource } from 'typeorm'
import { v5 as uuid } from 'uuid'
import type { AgentPluginScope } from '../agent-plugin-scope'
import { defaultAgentPluginsProgress } from './default-agent-plugins.schema'

@Injectable()
export class DefaultAgentPluginsStore {
    constructor(private readonly database: DataSource) {}

    private key(scope: AgentPluginScope) {
        return `xpert:agent-plugin-defaults:${scope.tenantId}:${scope.organizationId}`
    }

    async control<T>(scope: AgentPluginScope, work: () => Promise<T>): Promise<T> {
        const release = await this.lock(`${this.key(scope)}:control`, true)
        try {
            return await work()
        } finally {
            await release?.()
        }
    }

    acquire(scope: AgentPluginScope) {
        return this.lock(this.key(scope), false)
    }

    private async lock(key: string, wait: boolean): Promise<(() => Promise<void>) | null> {
        const connection = this.database.createQueryRunner()
        try {
            await connection.connect()
            const rows: { acquired: boolean }[] = await connection.query(
                wait
                    ? 'SELECT pg_advisory_lock(hashtext($1))'
                    : 'SELECT pg_try_advisory_lock(hashtext($1)) AS acquired',
                [key]
            )
            if (!wait && !rows[0]?.acquired) {
                await connection.release()
                return null
            }
        } catch (error) {
            await connection.release()
            throw error
        }
        return async () => {
            try {
                await connection.query('SELECT pg_advisory_unlock(hashtext($1))', [key])
            } finally {
                await connection.release()
            }
        }
    }

    async read(scope: AgentPluginScope): Promise<DefaultAgentPluginsImportProgress> {
        const row = await this.database.getRepository(TenantSetting).findOneBy({
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

    async save(scope: AgentPluginScope, progress: DefaultAgentPluginsImportProgress) {
        progress.updatedAt = new Date().toISOString()
        await this.database.getRepository(TenantSetting).save({
            id: uuid(this.key(scope), uuid.URL),
            tenantId: scope.tenantId,
            name: 'defaultAgentPluginImport',
            value: JSON.stringify(progress)
        })
    }
}
