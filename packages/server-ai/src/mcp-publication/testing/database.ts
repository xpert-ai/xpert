import { randomUUID } from 'node:crypto'
import { DataSource, Entity, PrimaryColumn } from 'typeorm'
import { ExecutionTaskControl, TaskControlPublication } from '@xpert-ai/server-core'
import { McpTask, McpPublication, McpPublicationCapability } from '../entities'
import { publication, principal } from './fixtures'

@Entity('user')
class User {
    @PrimaryColumn('uuid') id: string
}
@Entity('tenant')
class Tenant {
    @PrimaryColumn('uuid') id: string
}
@Entity('organization')
class Organization {
    @PrimaryColumn('uuid') id: string
}
export const mcpTestEntities = [
    User,
    Tenant,
    Organization,
    McpTask,
    McpPublication,
    McpPublicationCapability,
    ExecutionTaskControl,
    TaskControlPublication
]
export async function mcpTestDatabase(url: string, extraEntities: DataSource['options']['entities'] = []) {
    if (!new URL(url).pathname.endsWith('_test')) throw new Error('Disposable _test database required')
    const schema = `mcp_${randomUUID().replace(/-/g, '')}`
    const db = await new DataSource({
        type: 'postgres',
        url,
        schema,
        uuidExtension: 'pgcrypto',
        extra: { options: `-c search_path=${schema}` },
        entities: [...mcpTestEntities, ...Object.values(extraEntities)]
    }).initialize()
    await db.query(`CREATE SCHEMA "${schema}"`)
    await db.synchronize()
    await db.manager.insert(Tenant, { id: publication().tenantId })
    await db.manager.insert(Organization, { id: publication().organizationId })
    await db.manager.insert(User, { id: principal().subjectId })
    await db.manager.insert(User, { id: '10000000-0000-4000-8000-000000000008' })
    await db.getRepository(McpPublication).save({ ...publication(), name: 'test' })
    return {
        db,
        close: async () => {
            await db.query(`DROP SCHEMA "${schema}" CASCADE`)
            await db.destroy()
        }
    }
}
