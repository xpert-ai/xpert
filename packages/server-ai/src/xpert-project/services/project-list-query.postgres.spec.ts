import { randomUUID } from 'node:crypto'
import { DataSource, EntitySchema } from 'typeorm'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { findAvailableProjects, findAvailableProjectTypes } from './project-list-query'
import { XpertProject } from '../entities/project.entity'
import { XpertProjectMembership } from '../entities/project-membership.entity'
import { XpertTypeEnum, type IXpert, type TXpertProjectMemberRole, type TXpertProjectStatus } from '@xpert-ai/contracts'

jest.mock('@xpert-ai/server-core', () => ({ applyWhereToQueryBuilder: jest.fn() }))
jest.mock('../entities/project.entity', () => ({ XpertProject: class XpertProject {} }))
jest.mock('../entities/project-membership.entity', () => ({ XpertProjectMembership: class XpertProjectMembership {} }))
jest.mock('../../chat-conversation/conversation.entity', () => ({ ChatConversation: class ChatConversation {} }))

const url = process.env.XPERT_EXECUTION_TEST_DATABASE_URL
const integration = url ? describe : describe.skip
const uuid = { type: 'uuid' as const }
const text = { type: 'varchar' as const }
const base = { id: { ...uuid, primary: true }, tenantId: uuid, organizationId: uuid }
const entities = [
    new EntitySchema<XpertProject>({ name: 'XpertProject', target: XpertProject, columns: {
        ...base, ownerId: uuid, name: text, description: text, updatedAt: { type: 'timestamptz' },
        status: { ...text, nullable: true }, applicationKey: text, projectTypeKey: text, projectTypeSnapshot: { type: 'json', nullable: true }
    }, relations: {
        xperts: { type: 'many-to-many', target: 'DirectoryAssistant', joinTable: true },
        memberships: { type: 'one-to-many', target: 'XpertProjectMembership', inverseSide: 'project' }
    } }),
    new EntitySchema<XpertProjectMembership>({ name: 'XpertProjectMembership', target: XpertProjectMembership, columns: {
        ...base, projectId: uuid, userId: uuid, role: text, deletedAt: { type: 'timestamptz', nullable: true, deleteDate: true },
        removedAt: { type: 'timestamptz', nullable: true }
    }, relations: { project: { type: 'many-to-one', target: 'XpertProject', joinColumn: { name: 'projectId' } } } }),
    new EntitySchema<IXpert>({ name: 'DirectoryAssistant', columns: { ...base, slug: text, workspaceId: uuid, type: text } })
]

integration('Assistant project directory (PostgreSQL)', () => {
    const schema = 'project_directory_' + randomUUID().replace(/-/g, '')
    const tenantId = randomUUID(), organizationId = randomUUID(), workspaceId = randomUUID(), userId = randomUUID()
    let db: DataSource
    let assistant: IXpert
    beforeAll(async () => {
        if (!new URL(url).pathname.startsWith('/xpert_execution_test_')) throw Error('Dedicated test database required')
        db = await new DataSource({ type: 'postgres', url, schema, entities }).initialize()
        await db.query(`CREATE SCHEMA ${schema}`)
        await db.synchronize()
        const experts = db.getRepository<IXpert>('DirectoryAssistant')
        assistant = await experts.save({ id: randomUUID(), tenantId, organizationId, workspaceId, type: XpertTypeEnum.Agent, slug: 'delivery' })
        const previous = await experts.save({ ...assistant, id: randomUUID() })
        const other = await experts.save({ ...assistant, id: randomUUID(), slug: 'other' })
        let time = 0
        async function add(name: string, role?: TXpertProjectMemberRole | 'owner', options: {
            status?: TXpertProjectStatus; binding?: IXpert; removed?: boolean; deleted?: boolean; org?: string; type?: string
        } = {}) {
            const id = randomUUID(), org = options.org ?? organizationId
            const project = db.getRepository(XpertProject)
            await project.save({ id, name, description: name, tenantId, organizationId: org, ownerId: role === 'owner' ? userId : randomUUID(),
                status: options.status ?? 'active', updatedAt: new Date(++time * 1000), applicationKey: 'platform',
                projectTypeKey: options.type ?? 'general', xperts: [options.binding ?? assistant] })
            if (role && role !== 'owner') await db.getRepository(XpertProjectMembership).save({
                id: randomUUID(), tenantId, organizationId: org, projectId: id, userId, role,
                ...(options.removed ? { removedAt: new Date() } : {}), ...(options.deleted ? { deletedAt: new Date() } : {})
            })
        }
        await add('Owned', 'owner', { binding: previous })
        await add('Managed', 'manager')
        await add('Edited', 'editor')
        await add('Joined', 'member', { type: 'space' })
        await add('Archived', 'manager', { status: 'archived' })
        await add('Removed', 'manager', { removed: true })
        await add('Deleted', 'manager', { deleted: true })
        await add('Non-member')
        await add('Other assistant', 'owner', { binding: other })
        await add('Other organization', 'owner', { org: randomUUID() })
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(tenantId)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(organizationId)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(userId)
    })

    afterAll(async () => {
        jest.restoreAllMocks()
        if (db?.isInitialized) { await db.query(`DROP SCHEMA ${schema} CASCADE`); await db.destroy() }
    })

    it('filters and counts manageable projects before pagination, including earlier Assistant versions', async () => {
        const repository = db.getRepository(XpertProject)
        const input = { xpertId: assistant.id, manageableOnly: true, status: 'all' as const, take: 1 }
        const first = await findAvailableProjects(repository, assistant, input)
        const second = await findAvailableProjects(repository, assistant, { ...input, skip: 1 })
        expect(first.total).toBe(2)
        expect(first.items).toMatchObject([{ name: 'Managed', myRole: 'manager', canManage: true }])
        expect(second.items).toMatchObject([{ name: 'Owned', myRole: 'owner', canManage: true }])
        expect(await findAvailableProjectTypes(repository, assistant, true)).toMatchObject([{ projectTypeKey: 'general' }])
    })

    it('returns edit rights and exact membership without disclosing revoked, unrelated or cross-organization projects', async () => {
        const result = await findAvailableProjects(db.getRepository(XpertProject), assistant, { xpertId: assistant.id })
        expect(result.total).toBe(4)
        expect(result.items.map(({ name, myRole, canEdit, canManage }) => [name, myRole, canEdit, canManage])).toEqual([
            ['Joined', 'member', false, false], ['Edited', 'editor', true, false], ['Managed', 'manager', true, true], ['Owned', 'owner', true, true]
        ])
        const archived = await findAvailableProjects(db.getRepository(XpertProject), assistant, { xpertId: assistant.id, status: 'archived' })
        expect(archived.items).toMatchObject([{ name: 'Archived', canEdit: false, canManage: false }])
    })
})
