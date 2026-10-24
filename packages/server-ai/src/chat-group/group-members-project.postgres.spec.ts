import { randomUUID } from 'node:crypto'
import { CqrsModule } from '@nestjs/cqrs'
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { DataSource, EntitySchema } from 'typeorm'
import { UserType } from '@xpert-ai/contracts'
import { Organization, Role, User, UserOrganization } from '@xpert-ai/server-core'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { PublishedXpertAccessService } from '../xpert/published-xpert-access.service'
import { XpertPrincipalService } from '../xpert/xpert-principal.service'
import { XpertProject } from '../xpert-project/entities/project.entity'
import { XpertProjectMembership } from '../xpert-project/entities/project-membership.entity'
import { XpertProjectAccessService } from '../xpert-project/services/project-access.service'
import { XpertProjectMembershipService } from '../xpert-project/services/project-membership.service'
import { XpertProjectXpertBindingService } from '../xpert-project/services/project-xpert-binding.service'
import { EnsureXpertProjectMemberHandler } from '../xpert-project/commands/handlers/ensure-project-member.handler'
import { XpertTask } from '../xpert-task/xpert-task.entity'
import { GroupParticipant } from './group.entity'
import { GroupAccessService } from './group-access.service'
import { GroupMembersService } from './group-members.service'
import { runWithCapturedRequestContext } from '../shared/request-context'

// Use a disposable PostgreSQL database, never a platform database.
const databaseUrl = process.env.GROUP_TEST_DATABASE_URL
const postgres = databaseUrl ? describe : describe.skip
const schema = `group_members_${randomUUID().replace(/-/g, '')}`
const id = { type: 'uuid' as const, primary: true, generated: 'uuid' as const }
const uuid = { type: 'uuid' as const, nullable: true }
const text = { type: 'varchar' as const, nullable: true }
const base = { id, tenantId: uuid, organizationId: uuid, createdById: uuid }
const scope = { tenantId: randomUUID(), organizationId: randomUUID() }
const ownerId = randomUUID()
const userId = randomUUID()
const projectId = randomUUID()
const groupId = randomUUID()

function asUser<T>(actorId: string, work: () => Promise<T>) {
    return runWithCapturedRequestContext(
        {
            user: { id: actorId, tenantId: scope.tenantId, type: UserType.USER },
            headers: {
                'tenant-id': scope.tenantId,
                'organization-id': scope.organizationId,
                'x-scope-level': 'organization'
            }
        },
        work
    )
}

const schemas = [
    new EntitySchema<Role>({ name: 'Role', target: Role, columns: { id } }),
    new EntitySchema<Organization>({
        name: 'Organization',
        target: Organization,
        columns: { id, isActive: { type: 'boolean', default: true } }
    }),
    new EntitySchema<User>({
        name: 'User',
        target: User,
        columns: { id, tenantId: uuid, type: text, firstName: text, lastName: text, username: text, email: text },
        relations: { role: { type: 'many-to-one', target: 'Role', joinColumn: true, nullable: true } }
    }),
    new EntitySchema<UserOrganization>({
        name: 'UserOrganization',
        target: UserOrganization,
        columns: { ...base, userId: uuid, isActive: { type: 'boolean', default: true } },
        relations: {
            organization: { type: 'many-to-one', target: 'Organization', joinColumn: { name: 'organizationId' } }
        }
    }),
    new EntitySchema<XpertProject>({
        name: 'XpertProject',
        target: XpertProject,
        columns: { ...base, ownerId: uuid, status: text },
        relations: { members: { type: 'many-to-many', target: 'User', joinTable: true } }
    }),
    new EntitySchema<XpertProjectMembership>({
        name: 'XpertProjectMembership',
        target: XpertProjectMembership,
        columns: {
            ...base,
            projectId: uuid,
            userId: uuid,
            role: text,
            invitedById: uuid,
            joinedAt: { type: 'timestamptz', default: () => 'now()' },
            removedAt: { type: 'timestamptz', nullable: true },
            deletedAt: { type: 'timestamptz', nullable: true, deleteDate: true }
        },
        indices: [{ columns: ['projectId', 'userId'], unique: true }]
    }),
    new EntitySchema<ChatConversation>({
        name: 'ChatConversation',
        target: ChatConversation,
        columns: { ...base, projectId: uuid, purpose: text, revision: { type: 'int', default: 1 } }
    }),
    new EntitySchema<GroupParticipant>({
        name: 'GroupParticipant',
        target: GroupParticipant,
        columns: {
            ...base,
            groupId: uuid,
            subjectId: uuid,
            kind: text,
            name: text,
            role: { type: 'varchar', default: 'member' },
            active: { type: 'boolean', default: true }
        },
        indices: [{ columns: ['groupId', 'kind', 'subjectId'], unique: true }]
    })
]

postgres('group invitation and Project membership transaction', () => {
    let db: DataSource
    let module: TestingModule
    let service: GroupMembersService
    let projectAccess: XpertProjectAccessService

    beforeAll(async () => {
        db = await new DataSource({ type: 'postgres', url: databaseUrl, schema, entities: schemas }).initialize()
        await db.query(`CREATE SCHEMA "${schema}"`)
        await db.synchronize()
        module = await Test.createTestingModule({
            imports: [CqrsModule],
            providers: [
                GroupMembersService,
                GroupAccessService,
                XpertProjectAccessService,
                XpertProjectMembershipService,
                EnsureXpertProjectMemberHandler,
                { provide: DataSource, useValue: db },
                { provide: PublishedXpertAccessService, useValue: {} },
                { provide: XpertPrincipalService, useValue: {} },
                { provide: XpertProjectXpertBindingService, useValue: {} },
                { provide: EventEmitter2, useValue: {} },
                { provide: getRepositoryToken(XpertTask), useValue: {} },
                ...[User, UserOrganization, XpertProject, XpertProjectMembership].map((entity) => ({
                    provide: getRepositoryToken(entity),
                    useValue: db.getRepository(entity)
                }))
            ]
        }).compile()
        await module.init()
        service = module.get(GroupMembersService)
        projectAccess = module.get(XpertProjectAccessService)
        await db.getRepository(Organization).save({ id: scope.organizationId, isActive: true })
        await db
            .getRepository(User)
            .save([ownerId, userId].map((id) => ({ id, tenantId: scope.tenantId, type: UserType.USER })))
        await db
            .getRepository(UserOrganization)
            .save([ownerId, userId].map((userId) => ({ ...scope, userId, isActive: true })))
    })

    beforeEach(async () => {
        jest.restoreAllMocks()
        await db.getRepository(GroupParticipant).createQueryBuilder().delete().execute()
        await db.getRepository(ChatConversation).createQueryBuilder().delete().execute()
        await db.getRepository(XpertProjectMembership).createQueryBuilder().delete().execute()
        await db.getRepository(XpertProject).createQueryBuilder().delete().execute()
        await db.getRepository(XpertProject).save({ ...scope, id: projectId, ownerId, status: 'active' })
        await db
            .getRepository(ChatConversation)
            .save({ ...scope, id: groupId, purpose: 'group', projectId, revision: 1 })
        await db
            .getRepository(GroupParticipant)
            .save({ ...scope, groupId, subjectId: ownerId, kind: 'user', role: 'owner', active: true })
    })

    afterAll(async () => {
        jest.restoreAllMocks()
        await module?.close()
        if (db?.isInitialized) {
            await db.query(`DROP SCHEMA "${schema}" CASCADE`)
            await db.destroy()
        }
    })

    const invite = () => asUser(ownerId, () => service.add(groupId, { kind: 'user', subjectId: userId }))

    async function expectNoInvite() {
        expect(await db.getRepository(GroupParticipant).countBy({ groupId, subjectId: userId })).toBe(0)
        expect(await db.getRepository(XpertProjectMembership).countBy({ projectId, userId })).toBe(0)
        expect(
            (await db.getRepository(XpertProject).findOneOrFail({ where: { id: projectId }, relations: ['members'] }))
                .members
        ).toHaveLength(0)
        expect((await db.getRepository(ChatConversation).findOneByOrFail({ id: groupId })).revision).toBe(1)
    }

    it('turns a Project membership denial into access after inviting the user', async () => {
        await expect(asUser(userId, () => projectAccess.assertCanUse(projectId))).rejects.toMatchObject({ status: 403 })
        await invite()
        await expect(asUser(userId, () => projectAccess.assertCanUse(projectId))).resolves.toMatchObject({
            role: 'member'
        })
        await expect(asUser(userId, () => module.get(GroupAccessService).authorize(groupId))).resolves.toMatchObject({
            actor: { subjectId: userId }
        })
        const project = await db
            .getRepository(XpertProject)
            .findOneOrFail({ where: { id: projectId }, relations: ['members'] })
        expect(project.members.map((user) => user.id)).toEqual([userId])
    })

    it.each(['manager', 'editor', 'member'] as const)(
        'preserves an existing %s role and join date across repeated invitations',
        async (role) => {
            const joinedAt = new Date('2026-01-01T00:00:00Z')
            const original = await db
                .getRepository(XpertProjectMembership)
                .save({ ...scope, projectId, userId, role, joinedAt })
            await invite()
            await invite()
            expect(await db.getRepository(XpertProjectMembership).findBy({ projectId, userId })).toMatchObject([
                { id: original.id, role, joinedAt }
            ])
            expect(await db.getRepository(GroupParticipant).countBy({ groupId, subjectId: userId, active: true })).toBe(
                1
            )
        }
    )

    it('restores removed Project and group membership without reviving a former manager role', async () => {
        const original = await db.getRepository(XpertProjectMembership).save({
            ...scope,
            projectId,
            userId,
            role: 'manager',
            removedAt: new Date(),
            deletedAt: new Date()
        })
        const participant = await db
            .getRepository(GroupParticipant)
            .save({ ...scope, groupId, subjectId: userId, kind: 'user', active: false })
        await expect(invite()).resolves.toMatchObject({ id: participant.id, active: true })
        expect(await db.getRepository(XpertProjectMembership).findOneByOrFail({ projectId, userId })).toMatchObject({
            id: original.id,
            role: 'member',
            removedAt: null,
            deletedAt: null
        })
    })

    it('repairs a missing Project membership when an active group user is invited again', async () => {
        await db
            .getRepository(GroupParticipant)
            .save({ ...scope, groupId, subjectId: userId, kind: 'user', active: true })
        await invite()
        expect(await db.getRepository(XpertProjectMembership).countBy({ projectId, userId })).toBe(1)
    })

    it('does not create a redundant membership for the Project owner', async () => {
        await db.getRepository(XpertProject).update(projectId, { ownerId: userId })
        await db.getRepository(XpertProjectMembership).save({ ...scope, projectId, userId: ownerId, role: 'manager' })
        await invite()
        expect(await db.getRepository(XpertProjectMembership).countBy({ projectId, userId })).toBe(0)
        expect(await db.getRepository(GroupParticipant).countBy({ groupId, subjectId: userId, active: true })).toBe(1)
    })

    it('rolls back Project membership and the legacy member relation if saving the participant fails', async () => {
        const table = `"${schema}"."${db.getRepository(GroupParticipant).metadata.tableName}"`
        await db.query(`CREATE FUNCTION "${schema}".reject_invitee() RETURNS trigger AS $$
            BEGIN RAISE EXCEPTION 'participant persistence failed'; END;
            $$ LANGUAGE plpgsql`)
        await db.query(`CREATE TRIGGER reject_invitee BEFORE INSERT ON ${table}
            FOR EACH ROW EXECUTE FUNCTION "${schema}".reject_invitee()`)
        try {
            await expect(invite()).rejects.toThrow('participant persistence failed')
        } finally {
            await db.query(`DROP TRIGGER reject_invitee ON ${table}`)
            await db.query(`DROP FUNCTION "${schema}".reject_invitee()`)
        }
        await expectNoInvite()
    })

    it.each(['member', 'archived', 'other-organization', 'other-tenant'])(
        'rejects %s Project access without partial membership',
        async (reason) => {
            if (reason === 'member') {
                await db.getRepository(XpertProject).update(projectId, { ownerId: randomUUID() })
                await db
                    .getRepository(XpertProjectMembership)
                    .save({ ...scope, projectId, userId: ownerId, role: 'member' })
            } else if (reason === 'archived') {
                await db.getRepository(XpertProject).update(projectId, { status: 'archived' })
            } else {
                await db
                    .getRepository(XpertProject)
                    .update(
                        projectId,
                        reason === 'other-tenant' ? { tenantId: randomUUID() } : { organizationId: randomUUID() }
                    )
            }
            await expect(invite()).rejects.toMatchObject({ status: 403 })
            await expectNoInvite()
        }
    )

    it('serializes invitations from different groups bound to the same Project', async () => {
        const otherGroupId = randomUUID()
        await db.getRepository(ChatConversation).save({ ...scope, id: otherGroupId, purpose: 'group', projectId })
        await db
            .getRepository(GroupParticipant)
            .save({ ...scope, groupId: otherGroupId, subjectId: ownerId, kind: 'user', role: 'owner', active: true })
        await Promise.all([
            invite(),
            asUser(ownerId, () => service.add(otherGroupId, { kind: 'user', subjectId: userId }))
        ])
        expect(await db.getRepository(XpertProjectMembership).countBy({ projectId, userId })).toBe(1)
        expect(await db.getRepository(GroupParticipant).countBy({ subjectId: userId, active: true })).toBe(2)
    })
})
