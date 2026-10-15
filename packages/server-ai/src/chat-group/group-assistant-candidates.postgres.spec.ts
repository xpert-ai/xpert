import { randomUUID } from 'node:crypto'
import { DataSource } from 'typeorm'
import { Organization, User, UserGroup, UserOrganization } from '@xpert-ai/server-core'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { SecretTokenBindingType, UserType, XpertTypeEnum } from '@xpert-ai/contracts'
import { Xpert } from '../xpert/xpert.entity'
import { XpertWorkspace } from '../xpert-workspace/workspace.entity'
import { PublishedXpertAccessService } from '../xpert/published-xpert-access.service'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { GroupParticipant } from './group.entity'
import { GroupAccessService } from './group-access.service'
import { GroupCatalogService } from './group-catalog.service'
import { groupCandidateTestEntities } from './group-candidates-test.fixture'

const postgres = process.env.GROUP_TEST_DATABASE_URL ? describe : describe.skip
const scope = { tenantId: 'tenant', organizationId: 'org' }
const schema = `group_assistants_${randomUUID().replace(/-/g, '')}`
postgres('published group candidates with real PostgreSQL authorization and pagination', () => {
    let db: DataSource, published: PublishedXpertAccessService, catalog: GroupCatalogService
    const ids = (rows: { subjectId: string }[]) => rows.map((row) => row.subjectId)
    const saveAssistant = (id: string, overrides: Partial<Xpert> = {}) =>
        db.getRepository(Xpert).save({
            ...scope,
            id,
            name: id,
            slug: id,
            type: XpertTypeEnum.Agent,
            workspaceId: 'shared',
            createdById: 'another',
            latest: true,
            publishAt: new Date('2026-01-01'),
            createdAt: new Date('2026-01-01'),
            ...overrides
        })
    const member = (id: string, subjectId: string, active = true) =>
        db.getRepository(GroupParticipant).save({
            ...scope,
            id,
            groupId: 'group',
            subjectId,
            kind: 'assistant',
            active
        })
    beforeAll(async () => {
        db = await new DataSource({
            type: 'postgres',
            url: process.env.GROUP_TEST_DATABASE_URL,
            schema,
            entities: groupCandidateTestEntities
        }).initialize()
        await db.query(`CREATE SCHEMA "${schema}"`)
        await db.synchronize()
        published = new PublishedXpertAccessService(db.getRepository(Xpert))
        catalog = new GroupCatalogService(db, new GroupAccessService(db, published), published)
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(scope.tenantId)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(scope.organizationId)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('owner')
        jest.spyOn(RequestContext, 'currentApiKey').mockReturnValue(null)
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue(null)
        jest.spyOn(RequestContext, 'isTenantScope').mockReturnValue(false)
        await db.getRepository(Organization).save([
            { id: 'org', isActive: true },
            { id: 'elsewhere', isActive: true }
        ])
        await db
            .getRepository(User)
            .save(['owner', 'guest', 'outsider'].map((id) => ({ id, tenantId: 'tenant', type: UserType.USER })))
        await db
            .getRepository(UserOrganization)
            .save(['owner', 'guest', 'outsider'].map((id) => ({ id, ...scope, userId: id, isActive: true })))
        await db.getRepository(ChatConversation).save({ id: 'group', ...scope, purpose: 'group' })
        await db.getRepository(GroupParticipant).save(
            ['owner', 'guest'].map((id) => ({
                ...scope,
                id,
                subjectId: id,
                groupId: 'group',
                kind: 'user',
                role: id === 'owner' ? 'owner' : 'member',
                active: true
            }))
        )
        await db.getRepository(XpertWorkspace).save([
            { id: 'shared', ...scope, ownerId: 'another', settings: { access: { visibility: 'organization-shared' } } },
            { id: 'private', ...scope, ownerId: 'another' },
            {
                id: 'tenant-shared',
                tenantId: 'tenant',
                organizationId: null,
                settings: { access: { visibility: 'tenant-shared' } }
            },
            {
                id: 'foreign-org',
                tenantId: 'tenant',
                organizationId: 'elsewhere',
                settings: { access: { visibility: 'organization-shared' } }
            },
            {
                id: 'foreign-tenant',
                tenantId: 'elsewhere',
                organizationId: 'org',
                settings: { access: { visibility: 'organization-shared' } }
            },
            {
                id: 'archived',
                ...scope,
                status: 'archived',
                settings: { access: { visibility: 'organization-shared' } }
            }
        ])
    }, 60000)
    afterAll(async () => {
        jest.restoreAllMocks()
        if (db?.isInitialized) {
            await db.query(`DROP SCHEMA "${schema}" CASCADE`)
            await db.destroy()
        }
    })
    beforeEach(async () => {
        jest.mocked(RequestContext.currentUserId).mockReturnValue('owner')
        jest.mocked(RequestContext.currentApiPrincipal).mockReturnValue(null)
        await db.getRepository(GroupParticipant).delete({ kind: 'assistant' })
        await db.getRepository(Xpert).createQueryBuilder().delete().execute()
    })

    it('includes organization-shared and tenant-shared experts but excludes private, archived, cross-scope, draft and non-Agent records', async () => {
        await saveAssistant('shared-agent', { titleCN: '中文专家' })
        await saveAssistant('tenant-agent', { organizationId: null, workspaceId: 'tenant-shared' })
        await saveAssistant('private-agent', { workspaceId: 'private' })
        await saveAssistant('archived-agent', { workspaceId: 'archived' })
        await saveAssistant('other-org', {
            organizationId: 'elsewhere',
            workspaceId: 'foreign-org',
            createdById: 'owner'
        })
        await saveAssistant('other-tenant', {
            tenantId: 'elsewhere',
            workspaceId: 'foreign-tenant',
            createdById: 'owner'
        })
        await saveAssistant('bad-workspace-scope', { workspaceId: 'foreign-tenant' })
        await saveAssistant('draft', { publishAt: null })
        await saveAssistant('old', { latest: false })
        await saveAssistant('knowledge', { type: XpertTypeEnum.Knowledge })
        await saveAssistant('copilot', { type: XpertTypeEnum.Copilot })
        await saveAssistant('deleted', { deletedAt: new Date() })
        expect(ids(await catalog.candidates('assistant', '', 'group'))).toEqual(['shared-agent', 'tenant-agent'])
        expect((await catalog.candidates('assistant', '中文', 'group'))[0].name).toBe('中文专家')
        await expect(published.getAccessiblePublishedXpert('shared-agent')).resolves.toMatchObject({
            id: 'shared-agent'
        })
        for (const id of ['private-agent', 'other-org', 'other-tenant', 'archived-agent']) {
            await expect(published.getAccessiblePublishedXpert(id)).rejects.toThrow()
        }
        await db.getRepository(XpertWorkspace).update('shared', { settings: { access: { visibility: 'private' } } })
        try {
            expect(ids(await catalog.candidates('assistant', '', 'group'))).toEqual(['tenant-agent'])
            await expect(published.getAccessiblePublishedXpert('shared-agent')).rejects.toThrow()
        } finally {
            await db
                .getRepository(XpertWorkspace)
                .update('shared', { settings: { access: { visibility: 'organization-shared' } } })
        }
    })

    it('fills stable pages beyond 50 after excluding active exact and historical family memberships', async () => {
        for (let i = 0; i < 65; i++) await saveAssistant(`agent-${String(i).padStart(2, '0')}`)
        await member('exact', 'agent-00')
        await saveAssistant('historical', { slug: 'agent-01', latest: false })
        await member('old-version', 'historical')
        await member('removed', 'agent-02', false)
        await db.getRepository(GroupParticipant).save({
            ...scope,
            id: 'other-group',
            groupId: 'other',
            subjectId: 'agent-03',
            kind: 'assistant',
            active: true
        })
        const a = await catalog.candidates('assistant', '', 'group', { limit: 50, offset: 0 })
        const b = await catalog.candidates('assistant', '', 'group', { limit: 50, offset: 50 })
        expect(a).toHaveLength(50)
        expect(b).toHaveLength(13)
        expect(ids([...a, ...b])).toEqual(
            Array.from({ length: 63 }, (_, i) => `agent-${String(i + 2).padStart(2, '0')}`)
        )
        expect(await catalog.candidates('assistant', '', 'group', { limit: 50, offset: 100 })).toEqual([])
        expect(ids(await catalog.candidates('assistant', 'agent-64', 'group'))).toEqual(['agent-64'])
    })

    it('does not exclude another family with the same slug in a different workspace', async () => {
        await saveAssistant('old', { slug: 'same', latest: false })
        await saveAssistant('current', { slug: 'same' })
        await saveAssistant('different', { slug: 'same', workspaceId: 'private', createdById: 'owner' })
        await member('same-family', 'old')
        expect(ids(await catalog.candidates('assistant', '', 'group'))).toEqual(['different'])
    })

    it('deduplicates multiple UserGroup grants before SQL pagination and retains runtime-only access', async () => {
        const groups = await db
            .getRepository(UserGroup)
            .save(['grant-1', 'grant-2'].map((id) => ({ ...scope, id, members: [{ id: 'owner' }] })))
        await saveAssistant('a', { workspaceId: 'private', userGroups: groups })
        await saveAssistant('b', { workspaceId: 'private', userGroups: groups })
        const first = await catalog.candidates('assistant', '', 'group', { limit: 1, offset: 0 })
        const second = await catalog.candidates('assistant', '', 'group', { limit: 1, offset: 1 })
        expect(ids(first)).toEqual(['a'])
        expect(ids(second)).toEqual(['b'])
        await expect(published.getAccessiblePublishedXpert('a')).resolves.toMatchObject({ id: 'a' })
        const workspace = await db
            .getRepository(XpertWorkspace)
            .findOne({ where: { id: 'private' }, relations: ['members'] })
        expect(workspace.members).toEqual([])
        await db.getRepository(UserGroup).save(groups.map((group) => ({ ...group, members: [] })))
        expect(await catalog.candidates('assistant', '', 'group')).toEqual([])
        await expect(published.getAccessiblePublishedXpert('a')).rejects.toThrow()
    })

    it('rejects non-owners, removed owners and credentials bound to another group on every page', async () => {
        await saveAssistant('agent')
        for (const actor of ['guest', 'outsider']) {
            jest.mocked(RequestContext.currentUserId).mockReturnValue(actor)
            await expect(catalog.candidates('assistant', '', 'group', { limit: 1, offset: 1 })).rejects.toThrow()
        }
        jest.mocked(RequestContext.currentUserId).mockReturnValue('owner')
        await db.getRepository(GroupParticipant).update('owner', { active: false })
        try {
            await expect(catalog.candidates('assistant', '', 'group')).rejects.toThrow()
        } finally {
            await db.getRepository(GroupParticipant).update('owner', { active: true })
        }
        jest.mocked(RequestContext.currentApiPrincipal).mockReturnValue({
            principalType: 'client_secret',
            clientSecretBindingType: SecretTokenBindingType.USER_CONVERSATION,
            resourceScope: { kind: 'conversation', conversationId: 'other' }
        } as ReturnType<typeof RequestContext.currentApiPrincipal>)
        await expect(catalog.candidates('assistant', '', 'group')).rejects.toThrow()
    })
})
