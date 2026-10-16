jest.mock('@xpert-ai/server-core', () => ({ User: class User {}, UserGroup: class UserGroup {} }))
jest.mock('@xpert-ai/plugin-sdk', () => ({
    RequestContext: {
        currentTenantId: jest.fn(),
        getOrganizationId: jest.fn(),
        currentUserId: jest.fn(),
        currentUser: jest.fn(),
        currentApiPrincipal: jest.fn(),
        hasPermission: jest.fn(),
        isTenantScope: () => false
    }
}))
jest.mock('../xpert.entity', () => ({ Xpert: class Xpert {} }))
jest.mock('../../xpert-workspace/workspace.entity', () => ({ XpertWorkspace: class XpertWorkspace {} }))
jest.mock('i18next', () => ({ t: (key: string) => key }))
import { randomUUID } from 'node:crypto'
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common'
import { DataSource, EntitySchema } from 'typeorm'
import {
    IUserOrganization,
    PermissionsEnum,
    UserType,
    XpertTypeEnum,
    UserGroupManagedByEnum,
    UserGroupManagedEntityTypeEnum
} from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { User, UserGroup } from '@xpert-ai/server-core'
import { Xpert } from '../xpert.entity'
import { XpertWorkspace } from '../../xpert-workspace/workspace.entity'
import { XpertWorkspaceAccessService } from '../../xpert-workspace/workspace-access.service'
import { PublishedXpertAccessService } from '../published-xpert-access.service'
import { AssistantSharingService } from './sharing.service'

const postgres = process.env.XPERT_SHARING_TEST_DATABASE_URL ? describe : describe.skip
const schema = `sharing_${randomUUID().replace(/-/g, '')}`
const tenant = randomUUID(),
    org = randomUUID(),
    otherOrg = randomUUID()
const owner = randomUUID(),
    member = randomUUID(),
    editor = randomUUID(),
    foreign = randomUUID(),
    inactive = randomUUID(),
    deleted = randomUUID()
const workspace = randomUUID(),
    assistant = randomUUID(),
    oldVersion = randomUUID(),
    unrelated = randomUUID(),
    group = randomUUID()
const scopeColumns = {
    id: { type: 'uuid', primary: true, generated: 'uuid' },
    tenantId: { type: 'uuid' },
    organizationId: { type: 'uuid', nullable: true }
} as const

postgres('assistant sharing and runtime boundaries on PostgreSQL', () => {
    let db: DataSource,
        sharing: AssistantSharingService,
        runtime: PublishedXpertAccessService,
        access: XpertWorkspaceAccessService
    const actor = (id: string, groups = false) => {
        jest.mocked(RequestContext.currentUserId).mockReturnValue(id)
        jest.mocked(RequestContext.currentUser).mockReturnValue({ id, tenantId: tenant, type: UserType.USER })
        jest.mocked(RequestContext.hasPermission).mockImplementation(
            (permission) =>
                groups &&
                [PermissionsEnum.ORG_USERS_VIEW, PermissionsEnum.ORG_USERS_EDIT].includes(permission as PermissionsEnum)
        )
    }
    beforeAll(async () => {
        db = await new DataSource({
            type: 'postgres',
            url: process.env.XPERT_SHARING_TEST_DATABASE_URL,
            schema,
            extra: { options: `-c search_path=${schema},public` },
            entities: [
                new EntitySchema<User>({
                    name: 'User',
                    target: User,
                    tableName: 'user',
                    columns: {
                        id: { type: 'uuid', primary: true },
                        tenantId: { type: 'uuid' },
                        type: { type: 'varchar', default: 'user' },
                        email: { type: 'varchar' },
                        firstName: { type: 'varchar', nullable: true },
                        lastName: { type: 'varchar', nullable: true },
                        username: { type: 'varchar', nullable: true },
                        imageUrl: { type: 'varchar', nullable: true },
                        deletedAt: { type: 'timestamptz', nullable: true, deleteDate: true }
                    },
                    relations: { organizations: { type: 'one-to-many', target: 'Membership', inverseSide: 'user' } }
                }),
                new EntitySchema<IUserOrganization>({
                    name: 'Membership',
                    tableName: 'user_organization',
                    columns: {
                        ...scopeColumns,
                        userId: { type: 'uuid' },
                        isActive: { type: 'boolean', default: true }
                    },
                    relations: { user: { type: 'many-to-one', target: 'User', joinColumn: { name: 'userId' } } }
                }),
                new EntitySchema({
                    name: 'Organization',
                    tableName: 'organization',
                    columns: { id: { type: 'uuid', primary: true }, name: { type: 'varchar' } }
                }),
                new EntitySchema<UserGroup>({
                    name: 'UserGroup',
                    target: UserGroup,
                    tableName: 'user_group',
                    columns: {
                        ...scopeColumns,
                        name: { type: 'varchar' },
                        description: { type: 'varchar', nullable: true },
                        managedBy: { type: 'varchar', nullable: true },
                        managedEntityType: { type: 'varchar', nullable: true },
                        managedEntityId: { type: 'uuid', nullable: true },
                        createdById: { type: 'uuid', nullable: true },
                        updatedById: { type: 'uuid', nullable: true }
                    },
                    relations: {
                        members: {
                            type: 'many-to-many',
                            target: 'User',
                            joinTable: {
                                name: 'user_group_to_user',
                                joinColumn: { name: 'userGroupId' },
                                inverseJoinColumn: { name: 'userId' }
                            }
                        }
                    }
                }),
                new EntitySchema<XpertWorkspace>({
                    name: 'XpertWorkspace',
                    target: XpertWorkspace,
                    tableName: 'xpert_workspace',
                    columns: {
                        ...scopeColumns,
                        name: { type: 'varchar' },
                        ownerId: { type: 'uuid' },
                        status: { type: 'varchar', nullable: true },
                        settings: { type: 'jsonb', nullable: true }
                    },
                    relations: { members: { type: 'many-to-many', target: 'User', joinTable: true } }
                }),
                new EntitySchema<Xpert>({
                    name: 'Xpert',
                    target: Xpert,
                    tableName: 'xpert',
                    columns: {
                        ...scopeColumns,
                        name: { type: 'varchar' },
                        slug: { type: 'varchar' },
                        type: { type: 'varchar' },
                        workspaceId: { type: 'uuid', nullable: true },
                        createdById: { type: 'uuid' },
                        updatedById: { type: 'uuid', nullable: true },
                        publishAt: { type: 'timestamptz', nullable: true },
                        deletedAt: { type: 'timestamptz', nullable: true, deleteDate: true },
                        latest: { type: 'boolean', default: true },
                        version: { type: 'varchar', nullable: true },
                        app: { type: 'jsonb', nullable: true }
                    },
                    relations: {
                        workspace: {
                            type: 'many-to-one',
                            target: 'XpertWorkspace',
                            joinColumn: { name: 'workspaceId' }
                        },
                        organization: {
                            type: 'many-to-one',
                            target: 'Organization',
                            joinColumn: { name: 'organizationId' }
                        },
                        createdBy: { type: 'many-to-one', target: 'User', joinColumn: { name: 'createdById' } },
                        userGroups: {
                            type: 'many-to-many',
                            target: 'UserGroup',
                            joinTable: {
                                name: 'xpert_to_user_group',
                                joinColumn: { name: 'xpertId' },
                                inverseJoinColumn: { name: 'userGroupId' }
                            }
                        }
                    }
                })
            ]
        }).initialize()
        await db.query(`CREATE SCHEMA "${schema}"`)
        await db.synchronize()
        access = new XpertWorkspaceAccessService(db.getRepository(XpertWorkspace))
        sharing = new AssistantSharingService(db.getRepository(Xpert), access)
        runtime = new PublishedXpertAccessService(db.getRepository(Xpert), access)
    })
    afterAll(async () => {
        if (db?.isInitialized) {
            await db.query(`DROP SCHEMA "${schema}" CASCADE`)
            await db.destroy()
        }
    })
    beforeEach(async () => {
        await db.query(
            `TRUNCATE "${schema}".xpert, "${schema}".user_group, "${schema}".xpert_workspace, "${schema}"."user", "${schema}".organization CASCADE`
        )
        jest.mocked(RequestContext.currentTenantId).mockReturnValue(tenant)
        jest.mocked(RequestContext.getOrganizationId).mockReturnValue(org)
        jest.mocked(RequestContext.currentApiPrincipal).mockReturnValue(null)
        actor(owner)
        await db.getRepository('Organization').save([
            { id: org, name: 'Organization' },
            { id: otherOrg, name: 'Other' }
        ])
        for (const id of [owner, member, editor, foreign, inactive, deleted]) {
            await db.getRepository(User).save({
                id,
                tenantId: tenant,
                email: `${id}@example.test`,
                deletedAt: id === deleted ? new Date() : null
            })
            await db.getRepository('Membership').save({
                tenantId: tenant,
                organizationId: id === foreign ? otherOrg : org,
                userId: id,
                isActive: id !== inactive
            })
        }
        await db.getRepository(XpertWorkspace).save({
            id: workspace,
            tenantId: tenant,
            organizationId: org,
            name: 'Workspace',
            ownerId: owner,
            members: [{ id: editor }]
        })
        for (const id of [assistant, oldVersion, unrelated])
            await db.getRepository(Xpert).save({
                id,
                tenantId: tenant,
                organizationId: org,
                name: 'Assistant',
                slug: id === unrelated ? 'other' : 'assistant',
                type: XpertTypeEnum.Agent,
                workspaceId: workspace,
                createdById: owner,
                publishAt: new Date(),
                latest: id !== oldVersion
            })
        await db.getRepository(UserGroup).save({
            id: group,
            tenantId: tenant,
            organizationId: org,
            name: 'Team',
            members: [{ id: member }, { id: inactive }]
        })
    })
    const count = (id = assistant) => runtime.countAccessiblePublishedXperts({ id })

    it('allows the resource manager to share personally without any organization user permission; shares grant runtime only', async () => {
        expect((await sharing.get(assistant)).capabilities).toMatchObject({
            canManageAccess: true,
            canUseGroups: false
        })
        const candidates = await sharing.candidates(assistant, { search: '', skip: 0 })
        expect(candidates.items.map((user) => user.id).sort()).toEqual([owner, member, editor].sort())
        expect(candidates.items[0]).not.toHaveProperty('tenantId')
        await sharing.grantUsers(assistant, [member])
        actor(member)
        expect(await count()).toBe(1)
        expect(await count(oldVersion)).toBe(1)
        expect(await count(unrelated)).toBe(0)
        await expect(access.assertCanAuthor(workspace)).rejects.toBeInstanceOf(ForbiddenException)
        await expect(sharing.grantUsers(assistant, [editor])).rejects.toBeInstanceOf(ForbiddenException)
        const caps = await access.getAccess(workspace)
        expect(caps.capabilities).toMatchObject({ canRead: false, canWrite: false, canManage: false, canRun: true })
        actor(owner)
        await sharing.revokeUser(assistant, member)
        actor(member)
        expect(await count()).toBe(0)
        expect(await count(oldVersion)).toBe(0)
    })
    it.each([foreign, inactive, deleted])(
        'rejects foreign, inactive and deleted recipients atomically',
        async (invalid) => {
            await expect(sharing.grantUsers(assistant, [member, invalid])).rejects.toBeInstanceOf(BadRequestException)
            actor(member)
            expect(await count()).toBe(0)
        }
    )
    it('does not turn workspace editors or group administrators into sharing managers', async () => {
        actor(editor, true)
        expect((await sharing.get(assistant)).capabilities.canManageAccess).toBe(false)
        await expect(sharing.candidates(assistant, { search: '', skip: 0 })).rejects.toBeInstanceOf(ForbiddenException)
        await expect(sharing.setGroups(assistant, [group])).rejects.toBeInstanceOf(ForbiddenException)
        actor(member, true)
        await expect(sharing.get(assistant)).rejects.toBeInstanceOf(ForbiddenException)
    })
    it('enforces group capability at the server, validates the group scope and preserves personal shares', async () => {
        await expect(sharing.setGroups(assistant, [group])).rejects.toBeInstanceOf(ForbiddenException)
        await expect(sharing.candidates(assistant, { search: '', skip: 0 }, true)).rejects.toBeInstanceOf(
            ForbiddenException
        )
        await sharing.grantUsers(assistant, [editor])
        actor(owner, true)
        const initial = await sharing.get(assistant)
        await sharing.setGroups(assistant, [group], initial.groupRevision)
        await expect(sharing.setGroups(assistant, [], initial.groupRevision)).rejects.toThrow('AssistantSharingChanged')
        const foreignGroup = await db
            .getRepository(UserGroup)
            .save({ tenantId: tenant, organizationId: otherOrg, name: 'Foreign' })
        await expect(sharing.setGroups(assistant, [foreignGroup.id])).rejects.toBeInstanceOf(BadRequestException)
        const { groupId } = await sharing.grantUsers(assistant, [editor])
        await expect(sharing.setGroups(assistant, [groupId])).rejects.toBeInstanceOf(BadRequestException)
        expect(
            (await sharing.candidates(assistant, { search: '', skip: 0 }, true)).items.map((item) => item.id)
        ).toEqual([group])
        actor(member)
        expect(await count()).toBe(1)
        actor(owner, true)
        await sharing.setGroups(assistant, [])
        expect((await sharing.get(assistant)).users.map((user) => user.id)).toEqual([editor])
        actor(member)
        expect(await count()).toBe(0)
    })
    it.each(['personal', 'group'] as const)('revalidates active membership on every %s runtime grant', async (kind) => {
        if (kind === 'personal') await sharing.grantUsers(assistant, [member])
        else {
            actor(owner, true)
            await sharing.setGroups(assistant, [group])
        }
        actor(member)
        expect(await count()).toBe(1)
        await db.getRepository('Membership').update({ userId: member, organizationId: org }, { isActive: false })
        expect(await count()).toBe(0)
        expect((await access.getAccess(workspace)).capabilities.canRun).toBe(false)
    })
    it('unifies approved access with personal shares and revokes historical approvals across versions', async () => {
        await sharing.grantUsers(oldVersion, [member], UserGroupManagedByEnum.XPERT_MARKETPLACE)
        expect((await sharing.get(assistant)).users.map((user) => user.id)).toEqual([member])
        await sharing.revokeUser(assistant, member)
        actor(member)
        expect(await count(oldVersion)).toBe(0)
    })
    it('preserves inherited workspace access when a personal share is removed', async () => {
        await sharing.grantUsers(assistant, [editor])
        await sharing.revokeUser(assistant, editor)
        actor(editor)
        expect(await count()).toBe(1)
    })
    it('rejects cross organization, tenant and credential audiences before writes', async () => {
        jest.mocked(RequestContext.getOrganizationId).mockReturnValue(otherOrg)
        await expect(sharing.grantUsers(assistant, [member])).rejects.toThrow('AssistantSharingNotFound')
        jest.mocked(RequestContext.getOrganizationId).mockReturnValue(org)
        jest.mocked(RequestContext.currentTenantId).mockReturnValue(randomUUID())
        await expect(sharing.get(assistant)).rejects.toThrow('AssistantSharingNotFound')
        jest.mocked(RequestContext.currentTenantId).mockReturnValue(tenant)
        jest.mocked(RequestContext.currentApiPrincipal).mockReturnValue({ principalType: 'api_key', id: owner })
        await expect(sharing.grantUsers(assistant, [member])).rejects.toBeInstanceOf(ForbiddenException)
    })
    it('serializes concurrent personal grants without duplicate internal groups or lost members', async () => {
        await Promise.all([sharing.grantUsers(assistant, [member]), sharing.grantUsers(oldVersion, [editor])])
        expect((await sharing.get(assistant)).users.map((user) => user.id).sort()).toEqual([member, editor].sort())
        expect(await db.getRepository(UserGroup).countBy({ managedBy: UserGroupManagedByEnum.XPERT_SHARING })).toBe(1)
    })
    it('requires resource management for reverse group assignment and keeps the batch atomic', async () => {
        actor(editor, true)
        expect((await sharing.getGroupAuthorizations(group)).items).toEqual([])
        await expect(sharing.updateGroupAuthorizations(group, [assistant])).rejects.toBeInstanceOf(ForbiddenException)
        actor(owner, true)
        await expect(sharing.updateGroupAuthorizations(group, [assistant, randomUUID()])).rejects.toBeInstanceOf(
            ForbiddenException
        )
        actor(member)
        expect(await count()).toBe(0)
        actor(owner, true)
        await sharing.updateGroupAuthorizations(group, [assistant])
        actor(member)
        expect(await count()).toBe(1)
        expect(await count(oldVersion)).toBe(1)
        expect(await count(unrelated)).toBe(0)
    })
    it('rejects reverse assignment when the resource family changes before the write lock', async () => {
        actor(owner, true)
        const original = sharing.getGroupAuthorizations.bind(sharing)
        const read = jest.spyOn(sharing, 'getGroupAuthorizations').mockImplementationOnce(async (id) => {
            const result = await original(id)
            await db.getRepository(Xpert).update(assistant, { slug: 'changed-family' })
            return result
        })
        try {
            await expect(sharing.updateGroupAuthorizations(group, [assistant])).rejects.toBeInstanceOf(
                ConflictException
            )
            actor(member)
            expect(await count()).toBe(0)
            expect(await count(oldVersion)).toBe(0)
        } finally {
            read.mockRestore()
        }
    })
    it('does not let a copied private ACL group grant access to another Assistant family', async () => {
        const { groupId } = await sharing.grantUsers(assistant, [member])
        await db.createQueryBuilder().relation(Xpert, 'userGroups').of(unrelated).add(groupId)
        actor(member)
        expect(await count()).toBe(1)
        expect(await count(unrelated)).toBe(0)
    })
    it('does not reuse an unrelated managed group based on its name', async () => {
        await db.getRepository(UserGroup).save({
            tenantId: tenant,
            organizationId: org,
            name: 'Assistant access - Assistant',
            managedBy: UserGroupManagedByEnum.XPERT_SHARING,
            managedEntityType: UserGroupManagedEntityTypeEnum.XPERT,
            managedEntityId: unrelated
        })
        await sharing.grantUsers(assistant, [member])
        expect(await db.getRepository(UserGroup).countBy({ managedBy: UserGroupManagedByEnum.XPERT_SHARING })).toBe(2)
    })
})
