import { Test, TestingModule } from '@nestjs/testing'
import { CommandBus, CqrsModule } from '@nestjs/cqrs'
import { DataSource, EntitySchema } from 'typeorm'
import { randomUUID } from 'node:crypto'
import { Organization, Role, User, UserOrganization } from '@xpert-ai/server-core'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { SecretTokenBindingType, UserType } from '@xpert-ai/contracts'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { PublishedXpertAccessService } from '../xpert/published-xpert-access.service'
import { XpertProjectAccessService } from '../xpert-project/services/project-access.service'
import { GroupParticipant } from './group.entity'
import { GroupAccessService } from './group-access.service'
import { ResolveGroupRuntimeAccessCommand } from './group-runtime-access.command'
import { ResolveGroupRuntimeAccessHandler } from './group-runtime-access.handler'

// Only a disposable PostgreSQL database; membership and runtime binding queries use real persistence.
const postgres = process.env.GROUP_TEST_DATABASE_URL ? describe : describe.skip
const schema = `group_runtime_access_${randomUUID().replace(/-/g, '')}`
const id = { type: 'uuid' as const, primary: true, generated: 'uuid' as const }
const uuid = { type: 'uuid' as const, nullable: true }
const text = { type: 'varchar' as const, nullable: true }
const scopeColumns = { tenantId: uuid, organizationId: uuid }
const entities = [
    new EntitySchema({ name: 'Role', target: Role, columns: { id, name: text } }),
    new EntitySchema({
        name: 'Organization',
        target: Organization,
        columns: { id, isActive: { type: 'boolean', default: true } }
    }),
    new EntitySchema<User>({
        name: 'User',
        target: User,
        columns: { id, tenantId: uuid, type: text },
        relations: { role: { type: 'many-to-one', target: 'Role', joinColumn: true } }
    }),
    new EntitySchema<UserOrganization>({
        name: 'UserOrganization',
        target: UserOrganization,
        columns: { id, ...scopeColumns, userId: uuid, isActive: { type: 'boolean', default: true } },
        relations: {
            organization: { type: 'many-to-one', target: 'Organization', joinColumn: { name: 'organizationId' } }
        }
    }),
    new EntitySchema({
        name: 'ChatConversation',
        target: ChatConversation,
        columns: {
            id,
            ...scopeColumns,
            createdById: uuid,
            xpertId: uuid,
            projectId: uuid,
            threadId: uuid,
            purpose: text
        }
    }),
    new EntitySchema({
        name: 'GroupParticipant',
        target: GroupParticipant,
        columns: {
            id,
            ...scopeColumns,
            groupId: uuid,
            subjectId: uuid,
            kind: text,
            role: text,
            runtimeConversationId: uuid,
            runtimeThreadId: uuid,
            active: { type: 'boolean', default: true }
        }
    })
]

postgres('group runtime authorization with PostgreSQL and registered CQRS handler', () => {
    let db: DataSource, module: TestingModule, commands: CommandBus
    let group: ChatConversation, runtime: ChatConversation, participant: GroupParticipant
    const scope = { tenantId: randomUUID(), organizationId: randomUUID() }
    const creator = randomUUID(),
        invited = randomUUID(),
        outsider = randomUUID(),
        assistant = randomUUID()
    const actor = (userId = invited) => ({ ...scope, userId })
    const published = { getAccessiblePublishedXpert: jest.fn() }
    const projects = { assertCanUseXpert: jest.fn() }
    const resolve = (userId = invited) =>
        commands.execute(
            new ResolveGroupRuntimeAccessCommand(actor(userId), { type: 'runtime', conversationId: runtime.id })
        )

    beforeAll(async () => {
        db = await new DataSource({
            type: 'postgres',
            url: process.env.GROUP_TEST_DATABASE_URL,
            schema,
            entities,
            synchronize: false
        }).initialize()
        await db.query(`CREATE SCHEMA "${schema}"`)
        await db.synchronize()
        module = await Test.createTestingModule({
            imports: [CqrsModule],
            providers: [
                GroupAccessService,
                ResolveGroupRuntimeAccessHandler,
                { provide: DataSource, useValue: db },
                { provide: PublishedXpertAccessService, useValue: published },
                { provide: XpertProjectAccessService, useValue: projects }
            ]
        }).compile()
        await module.init()
        commands = module.get(CommandBus)
        await db.getRepository(Organization).save({ id: scope.organizationId, isActive: true })
        for (const userId of [creator, invited, outsider]) {
            await db.getRepository(User).save({ id: userId, tenantId: scope.tenantId, type: UserType.USER })
            await db.getRepository(UserOrganization).save({ ...scope, userId, isActive: true })
        }
    }, 60000)
    beforeEach(async () => {
        published.getAccessiblePublishedXpert.mockReset().mockResolvedValue({ id: assistant })
        projects.assertCanUseXpert.mockReset().mockResolvedValue({})
        await db.getRepository(GroupParticipant).clear()
        await db.getRepository(ChatConversation).clear()
        await db.getRepository(UserOrganization).update({ ...scope }, { isActive: true })
        await db.getRepository(Organization).update(scope.organizationId, { isActive: true })
        group = await db
            .getRepository(ChatConversation)
            .save({ ...scope, purpose: 'group', createdById: creator, xpertId: assistant })
        runtime = await db.getRepository(ChatConversation).save({
            ...scope,
            purpose: 'group_assistant_runtime',
            createdById: creator,
            xpertId: assistant,
            threadId: randomUUID()
        })
        for (const userId of [creator, invited])
            await db.getRepository(GroupParticipant).save({
                ...scope,
                groupId: group.id,
                kind: 'user',
                subjectId: userId,
                role: userId === creator ? 'owner' : 'member',
                active: true
            })
        participant = await db.getRepository(GroupParticipant).save({
            ...scope,
            groupId: group.id,
            kind: 'assistant',
            subjectId: assistant,
            runtimeConversationId: runtime.id,
            runtimeThreadId: runtime.threadId,
            active: true
        })
    })
    afterEach(() => jest.restoreAllMocks())
    afterAll(async () => {
        await module?.close()
        if (db?.isInitialized) {
            await db.query(`DROP SCHEMA "${schema}" CASCADE`)
            await db.destroy()
        }
    })
    it('resolves the same runtime for creator and invited member while retaining their actual identities', async () => {
        const seen: string[] = []
        published.getAccessiblePublishedXpert.mockImplementation(async () => {
            seen.push(RequestContext.currentUserId())
            return { id: assistant }
        })
        expect(await resolve(creator)).toEqual({ groupId: group.id, assistantId: assistant })
        expect(await resolve(invited)).toEqual({ groupId: group.id, assistantId: assistant })
        expect(seen).toEqual([creator, invited])
        expect(
            await commands.execute(new ResolveGroupRuntimeAccessCommand(actor(), { type: 'group', groupId: group.id }))
        ).toEqual({ groupId: group.id, assistantId: assistant })
    })
    it('rejects an organization member outside the group and rechecks membership after revocation', async () => {
        await expect(resolve(outsider)).rejects.toThrow()
        await resolve()
        await db.getRepository(GroupParticipant).update({ groupId: group.id, subjectId: invited }, { active: false })
        await expect(resolve()).rejects.toThrow()
    })
    it.each(['organizationMembership', 'organization', 'assistantMembership'] as const)(
        'rechecks live %s',
        async (target) => {
            await resolve()
            if (target === 'organizationMembership')
                await db.getRepository(UserOrganization).update({ ...scope, userId: invited }, { isActive: false })
            if (target === 'organization')
                await db.getRepository(Organization).update(scope.organizationId, { isActive: false })
            if (target === 'assistantMembership')
                await db.getRepository(GroupParticipant).update(participant.id, { active: false })
            await expect(resolve()).rejects.toThrow()
        }
    )
    it('retains published Assistant and Project resource checks', async () => {
        published.getAccessiblePublishedXpert.mockRejectedValueOnce(new Error('Assistant denied'))
        await expect(resolve()).rejects.toThrow('Assistant denied')
        const projectId = randomUUID()
        await db.getRepository(ChatConversation).update(runtime.id, { projectId })
        await resolve()
        expect(projects.assertCanUseXpert).toHaveBeenCalledWith(projectId, assistant, actor())
        projects.assertCanUseXpert.mockRejectedValueOnce(new Error('Project denied'))
        await expect(resolve()).rejects.toThrow('Project denied')
    })
    it.each(['tenantId', 'organizationId'] as const)('rejects missing and foreign %s', async (field) => {
        for (const value of ['', randomUUID()])
            await expect(
                commands.execute(
                    new ResolveGroupRuntimeAccessCommand(
                        { ...actor(), [field]: value },
                        { type: 'runtime', conversationId: runtime.id }
                    )
                )
            ).rejects.toThrow()
    })
    it.each(['threadId', 'xpertId', 'purpose'] as const)('rejects a mismatched persisted runtime %s', async (field) => {
        await db
            .getRepository(ChatConversation)
            .update(runtime.id, { [field]: field === 'purpose' ? 'chat' : randomUUID() })
        await expect(resolve()).rejects.toThrow()
    })
    it('rejects missing primary or subject identity instead of broadening SQL predicates', async () => {
        await db.getRepository(ChatConversation).update(group.id, { xpertId: null })
        await expect(
            commands.execute(new ResolveGroupRuntimeAccessCommand(actor(), { type: 'group', groupId: group.id }))
        ).rejects.toThrow()
        await db.getRepository(GroupParticipant).update(participant.id, { subjectId: null })
        await expect(resolve()).rejects.toThrow()
    })
    it('preserves HTTP principal audience and lifetime rather than rebuilding a broader context', async () => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(invited)
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(scope.tenantId)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(scope.organizationId)
        await expect(resolve(creator)).rejects.toThrow()
        const principal = {
            id: invited,
            tenantId: scope.tenantId,
            principalType: 'client_secret' as const,
            clientSecretBindingType: SecretTokenBindingType.USER_CONVERSATION,
            requestedOrganizationId: scope.organizationId,
            resourceScope: { kind: 'conversation' as const, conversationId: group.id },
            clientSecretExpiresAt: new Date(Date.now() + 60_000)
        }
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue(principal)
        await resolve()
        principal.resourceScope.conversationId = randomUUID()
        await expect(resolve()).rejects.toThrow()
        principal.resourceScope.conversationId = group.id
        principal.clientSecretExpiresAt = new Date(0)
        await expect(resolve()).rejects.toThrow()
    })
})
