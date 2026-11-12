import { randomUUID } from 'node:crypto'
import { DataSource, EntitySchema } from 'typeorm'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import { XpertProject } from '../../../xpert-project/entities/project.entity'
import { XpertProjectMembership } from '../../../xpert-project/entities/project-membership.entity'
import { Xpert } from '../../../xpert/xpert.entity'
import { ChatConversation } from '../../../chat-conversation/conversation.entity'
import { findAvailableProjects } from '../../../xpert-project/services/project-list-query'

// Use a disposable database; the suite creates and removes only its unique schema.
const databaseUrl = process.env.GROUP_TEST_DATABASE_URL
const postgres = databaseUrl ? describe : describe.skip
const uuid = { type: 'uuid' as const, nullable: true }
const text = { type: 'varchar' as const, nullable: true }
const base = {
    id: { type: 'uuid' as const, primary: true, generated: 'uuid' as const },
    tenantId: uuid,
    organizationId: uuid
}
const schemas = [
    new EntitySchema({
        name: 'Xpert',
        target: Xpert,
        tableName: 'xpert',
        columns: {
            ...base,
            type: text,
            slug: text,
            workspaceId: uuid
        }
    }),
    new EntitySchema<XpertProject>({
        name: 'XpertProject',
        target: XpertProject,
        tableName: 'project',
        columns: {
            ...base,
            name: text,
            description: text,
            status: text,
            ownerId: uuid,
            applicationKey: text,
            projectTypeKey: text,
            updatedAt: { type: 'timestamptz', updateDate: true }
        },
        relations: {
            xperts: { type: 'many-to-many', target: 'Xpert', joinTable: true }
        }
    }),
    new EntitySchema({
        name: 'XpertProjectMembership',
        target: XpertProjectMembership,
        tableName: 'project_membership',
        columns: {
            ...base,
            projectId: uuid,
            userId: uuid,
            role: text,
            deletedAt: { type: 'timestamptz', nullable: true },
            removedAt: { type: 'timestamptz', nullable: true }
        }
    }),
    new EntitySchema({
        name: 'ChatConversation',
        target: ChatConversation,
        tableName: 'conversation',
        columns: {
            ...base,
            projectId: uuid,
            purpose: text
        }
    })
]

postgres('group Project discovery with PostgreSQL', () => {
    let db: DataSource
    let assistant: Xpert
    const scope = { tenantId: randomUUID(), organizationId: randomUUID() }
    const userId = randomUUID()
    const groupId = randomUUID()
    const projectType = { applicationKey: 'test:dashboard', projectTypeKey: 'dashboard' }
    const schema = `group_projects_${randomUUID().replace(/-/g, '')}`
    beforeAll(async () => {
        db = await new DataSource({ type: 'postgres', url: databaseUrl, entities: schemas, schema }).initialize()
        await db.query(`CREATE SCHEMA "${schema}"`)
        await db.synchronize()
        assistant = await db.getRepository(Xpert).save({ ...scope, type: XpertTypeEnum.Agent, slug: 'cfo' })
    })
    beforeEach(() => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(userId)
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(scope.tenantId)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(scope.organizationId)
    })
    afterEach(() => jest.restoreAllMocks())
    afterAll(async () => {
        if (db) {
            await db.query(`DROP SCHEMA "${schema}" CASCADE`)
            await db.destroy()
        }
    })
    it('filters usage, type and management rights before counting and pagination, without exposing other groups', async () => {
        const create = (name: string, override: Partial<XpertProject> = {}) =>
            db.getRepository(XpertProject).save({
                ...scope,
                ...projectType,
                name,
                ownerId: userId,
                status: 'active',
                xperts: [assistant],
                ...override
            })
        const free = await create('Independent')
        const shared = await create('Shared')
        const managed = await create('Managed', { ownerId: randomUUID() })
        const readable = await create('Read only', { ownerId: randomUUID() })
        const removed = await create('Removed manager', { ownerId: randomUUID() })
        const foreign = await create('Foreign organization', { organizationId: randomUUID() })
        const privateOnly = await create('Private conversation')
        await create('Different type', { projectTypeKey: 'other' })
        await create('Archived', { status: 'archived' })
        await create('Unlinked', { xperts: [] })
        await create('Foreign tenant', { tenantId: randomUUID() })
        await db.getRepository(XpertProjectMembership).save([
            { ...scope, projectId: managed.id, userId, role: 'manager' },
            { ...scope, projectId: readable.id, userId, role: 'member' },
            { ...scope, projectId: removed.id, userId, role: 'manager', removedAt: new Date() },
            { ...scope, projectId: foreign.id, userId, role: 'manager' }
        ])
        await db.getRepository(ChatConversation).save([
            { ...scope, purpose: 'group', projectId: shared.id },
            { ...scope, purpose: 'private', projectId: privateOnly.id },
            { ...scope, id: groupId, purpose: 'group', projectId: managed.id }
        ])
        const query = (usage: 'independent' | 'reuse', skip = 0, take = 100) =>
            findAvailableProjects(db.getRepository(XpertProject), assistant, {
                xpertId: assistant.id,
                group: { id: groupId, usage, projectType },
                status: 'active',
                skip,
                take
            })
        const independent = await query('independent')
        expect(independent.total).toBe(3)
        expect(independent.items.map((p) => p.id).sort()).toEqual([free.id, managed.id, privateOnly.id].sort())
        const page = await query('independent', 1, 1)
        expect(page.total).toBe(3)
        expect(page.items.map((p) => p.id)).toEqual([independent.items[1].id])
        const reused = await query('reuse')
        expect(reused.total).toBe(1)
        expect(reused.items.map((p) => p.id)).toEqual([shared.id])
        expect(reused.items[0]).not.toHaveProperty('groups')
        // The ordinary Project picker retains readable Projects and has no group isolation filter.
        const ordinary = await findAvailableProjects(db.getRepository(XpertProject), assistant, {
            xpertId: assistant.id
        })
        expect(ordinary.items.map((p) => p.id)).toContain(readable.id)
        expect(ordinary.items.map((p) => p.id)).toContain(shared.id)
    })
})
