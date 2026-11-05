jest.mock('@xpert-ai/server-core', () => ({
    ...jest.requireActual('../../../server/src/api-key/assistant-runtime-compatibility'),
    UserOrganization: class UserOrganization {}
}))
jest.mock('./xpert.entity', () => ({ Xpert: class Xpert {} }))
jest.mock('../xpert-workspace/workspace.entity', () => ({ XpertWorkspace: class XpertWorkspace {} }))

jest.mock('../xpert-project/entities/project.entity', () => ({ XpertProject: class XpertProject {} }))
jest.mock('../knowledgebase/persistence/knowledgebase.entity', () => ({ Knowledgebase: class Knowledgebase {} }))
jest.mock('../knowledgebase/runtime/knowledge-resource-access.service', () => ({
    KnowledgeResourceAccessService: class KnowledgeResourceAccessService {}
}))

import { assistantRuntimeCredential } from '@xpert-ai/server-core'
import { Knowledgebase } from '../knowledgebase/persistence/knowledgebase.entity'
import { AssistantKnowledgeRetrievalService } from '../knowledgebase/retrieval/assistant-knowledge-retrieval.service'
import { KnowledgeResourceAccessService } from '../knowledgebase/runtime/knowledge-resource-access.service'
import { randomUUID } from 'node:crypto'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { DataSource, EntitySchema } from 'typeorm'
import { ForbiddenException } from '@nestjs/common'
import { AIPermissionsEnum, IApiPrincipal, SecretTokenBindingType, UserType } from '@xpert-ai/contracts'
import { als, RequestContext } from '@xpert-ai/plugin-sdk'
import { Xpert } from './xpert.entity'
import { XpertWorkspace } from '../xpert-workspace/workspace.entity'
import { XpertWorkspaceAccessService } from '../xpert-workspace/workspace-access.service'
import { PublishedXpertAccessService } from './published-xpert-access.service'

const url = process.env.XPERT_ASSISTANT_RUNTIME_TEST_DATABASE_URL
const integration = url ? describe : describe.skip
const tenant = randomUUID(),
    org = randomUUID(),
    user = randomUUID(),
    owner = randomUUID()
const workspaceId = randomUUID(),
    otherWorkspaceId = randomUUID(),
    assistantId = randomUUID(),
    siblingId = randomUUID()
const schema = `runtime_${randomUUID().replace(/-/g, '')}`
class Member {
    id: string
}
class Group {
    id: string
}

integration('Assistant technical credential lists and point reads / PostgreSQL', () => {
    let database: DataSource, workspaces: XpertWorkspaceAccessService, assistants: PublishedXpertAccessService
    let actor: IApiPrincipal
    const capabilities = { canRead: false, canRun: true, canWrite: false, canManage: false }
    function inRequest<T>(work: () => Promise<T>, organizationId?: string) {
        const request = Object.assign(new IncomingMessage(new Socket()), {
            user: actor,
            headers: organizationId ? { 'organization-id': organizationId } : {}
        })
        return als.run(new RequestContext(request, new ServerResponse(request), 'test'), work)
    }
    beforeAll(async () => {
        if (!new URL(url).pathname.endsWith('_test')) throw new Error('Use a disposable _test database')
        database = new DataSource({
            type: 'postgres',
            url,
            schema,
            extra: { options: `-c search_path=${schema},public` },
            entities: [
                new EntitySchema({ name: 'Member', target: Member, columns: { id: { type: 'uuid', primary: true } } }),
                new EntitySchema({ name: 'Group', target: Group, columns: { id: { type: 'uuid', primary: true } } }),
                new EntitySchema<XpertWorkspace>({
                    name: 'XpertWorkspace',
                    target: XpertWorkspace,
                    tableName: 'xpert_workspace',
                    columns: {
                        id: { type: 'uuid', primary: true },
                        tenantId: { type: 'uuid' },
                        organizationId: { type: 'uuid', nullable: true },
                        name: { type: 'varchar' },
                        description: { type: 'varchar', nullable: true },
                        ownerId: { type: 'uuid' },
                        status: { type: 'varchar', nullable: true },
                        settings: { type: 'jsonb', nullable: true }
                    },
                    relations: { members: { type: 'many-to-many', target: 'Member', joinTable: true } }
                }),
                new EntitySchema<Knowledgebase>({
                    name: 'Knowledgebase',
                    target: Knowledgebase,
                    tableName: 'knowledgebase',
                    columns: {
                        id: { type: 'uuid', primary: true },
                        tenantId: { type: 'uuid' },
                        organizationId: { type: 'uuid', nullable: true },
                        workspaceId: { type: 'uuid' },
                        resourceRef: { type: 'jsonb', nullable: true }
                    }
                }),
                new EntitySchema<Xpert>({
                    name: 'Xpert',
                    target: Xpert,
                    tableName: 'xpert',
                    columns: {
                        id: { type: 'uuid', primary: true },
                        tenantId: { type: 'uuid' },
                        organizationId: { type: 'uuid', nullable: true },
                        workspaceId: { type: 'uuid' },
                        userId: { type: 'uuid', nullable: true },
                        name: { type: 'varchar' },
                        slug: { type: 'varchar', nullable: true },
                        publishAt: { type: 'timestamptz', nullable: true }
                    },
                    relations: {
                        workspace: {
                            type: 'many-to-one',
                            target: 'XpertWorkspace',
                            joinColumn: { name: 'workspaceId' }
                        },
                        knowledgebases: {
                            type: 'many-to-many',
                            target: 'Knowledgebase',
                            joinTable: { name: 'xpert_to_knowledgebase' }
                        },
                        userGroups: { type: 'many-to-many', target: 'Group', joinTable: true }
                    }
                })
            ]
        })
        await database.initialize()
        await database.query(`CREATE SCHEMA "${schema}"`)
        await database.synchronize()
        await database.query(`CREATE TABLE "user" (id uuid, "tenantId" uuid, "roleId" uuid, "isActive" boolean);
            CREATE TABLE role_permission ("tenantId" uuid, "roleId" uuid, permission varchar, enabled boolean);
            CREATE TABLE plugin_application_installation (id uuid, "tenantId" uuid, "organizationId" uuid,
                "workspaceId" varchar, "pluginName" varchar, "appName" varchar, "resourceRefs" jsonb);
            CREATE TABLE app_platform_delivery ("tenantId" uuid, "organizationId" uuid, "userId" uuid,
                "readyAt" timestamptz, apps jsonb, configuration jsonb)`)
        await database.getRepository(XpertWorkspace).save(
            [workspaceId, otherWorkspaceId].map((id) => ({
                id,
                tenantId: tenant,
                organizationId: org,
                name: 'workspace',
                ownerId: user,
                settings: { access: { visibility: 'organization-shared' as const } }
            }))
        )
        await database.getRepository(Xpert).save(
            [assistantId, siblingId].map((id) => ({
                id,
                tenantId: tenant,
                organizationId: org,
                workspaceId,
                userId: user,
                name: 'assistant',
                publishAt: new Date()
            }))
        )
        workspaces = new XpertWorkspaceAccessService(database.getRepository(XpertWorkspace))
        assistants = new PublishedXpertAccessService(database.getRepository(Xpert), workspaces)
    })
    afterAll(async () => {
        if (database?.isInitialized) {
            await database.query(`DROP SCHEMA "${schema}" CASCADE`)
            await database.destroy()
        }
    })
    beforeEach(() => {
        actor = {
            id: user,
            tenantId: tenant,
            type: UserType.COMMUNICATION,
            principalType: 'api_key',
            apiKeyUserId: user,
            ownerUserId: owner,
            resourceScope: { kind: 'assistant', xpertId: assistantId },
            apiKey: { token: 'fixture', tenantId: tenant, userId: user }
        }
    })
    it('searches only live published knowledge bindings with the Assistant runtime credential', async () => {
        const bound = randomUUID(),
            unbound = randomUUID(),
            foreign = randomUUID(),
            otherWorkspace = randomUUID()
        const libraries = database.getRepository(Knowledgebase)
        await libraries.save(
            [bound, unbound, foreign, otherWorkspace].map((id) => ({
                id,
                tenantId: tenant,
                organizationId: id === foreign ? randomUUID() : org,
                workspaceId: id === otherWorkspace ? otherWorkspaceId : workspaceId
            }))
        )
        const relation = database.createQueryBuilder().relation(Xpert, 'knowledgebases').of(assistantId)
        await relation.add([bound, foreign, otherWorkspace])
        await database.createQueryBuilder().relation(Xpert, 'knowledgebases').of(siblingId).add(unbound)
        const resources = Object.create(KnowledgeResourceAccessService.prototype) as KnowledgeResourceAccessService
        const resourceRead = jest.fn().mockRejectedValue(new ForbiddenException())
        Object.assign(resources, { authorizeReference: resourceRead })
        const retrieval = new AssistantKnowledgeRetrievalService(libraries, resources)
        await inRequest(async () => {
            const credential = assistantRuntimeCredential(RequestContext.currentUser())
            if (!credential) throw new Error('Expected an Assistant runtime credential')
            const scope = { tenantId: tenant, organizationId: org, xpertId: assistantId }
            const load = (ids: string[]) => retrieval.findBound(credential, ids, scope)
            await expect(workspaces.assertCanRead(workspaceId)).rejects.toBeInstanceOf(ForbiddenException)
            expect((await load([bound, bound])).map((kb) => kb.id)).toEqual([bound])
            await expect(load([bound, unbound])).rejects.toBeInstanceOf(ForbiddenException)
            await expect(
                retrieval.findBound(credential, [bound], { ...scope, organizationId: randomUUID() })
            ).rejects.toBeInstanceOf(ForbiddenException)
            await expect(load([otherWorkspace])).rejects.toBeInstanceOf(ForbiddenException)
            await expect(load([foreign])).rejects.toBeInstanceOf(ForbiddenException)
            await expect(
                retrieval.findBound(credential, [bound], { ...scope, xpertId: siblingId })
            ).rejects.toBeInstanceOf(ForbiddenException)
            await expect(
                retrieval.findBound(credential, [bound], { ...scope, tenantId: randomUUID() })
            ).rejects.toBeInstanceOf(ForbiddenException)
            await libraries.update(bound, { resourceRef: { providerKey: 'fixture', resourceId: bound } })
            await expect(load([bound])).rejects.toBeInstanceOf(ForbiddenException)
            expect(resourceRead).toHaveBeenCalledWith({ providerKey: 'fixture', resourceId: bound }, 'read')
            await libraries.update(bound, { resourceRef: null })
            await inRequest(async () => {
                expect((await load([bound])).map((kb) => kb.id)).toEqual([bound])
            })
            await relation.remove(bound)
            await expect(load([bound])).rejects.toBeInstanceOf(ForbiddenException)
        }, org)
    })
    async function assertDenied() {
        expect(await workspaces.findAccessibleWorkspaces()).toEqual([])
        await expect(workspaces.assertCanRun(workspaceId)).rejects.toBeInstanceOf(ForbiddenException)
        expect(await assistants.findAccessiblePublishedXperts()).toEqual([])
        expect(await assistants.countAccessiblePublishedXperts()).toBe(0)
        await expect(assistants.getAccessiblePublishedXpert(assistantId)).rejects.toBeInstanceOf(ForbiddenException)
    }
    it.each(['api_key', 'client_secret'] as const)(
        'allows roleless %s access only within the binding without organization headers',
        async (type) => {
            actor.principalType = type
            if (type === 'client_secret') {
                actor.clientSecretBindingType = SecretTokenBindingType.API_KEY
                actor.requestedUserId = actor.id
            }
            await inRequest(async () => {
                expect(RequestContext.hasPermission(AIPermissionsEnum.CHAT_VIEW)).toBe(false)
                const listed = await workspaces.findAccessibleWorkspaces()
                expect(listed.map((workspace) => workspace.id)).toEqual([workspaceId])
                expect(listed[0].capabilities).toEqual(capabilities)
                expect(listed[0].settings).toBeUndefined()
                expect(listed[0].members).toBeUndefined()
                expect((await workspaces.assertCanRun(workspaceId)).capabilities).toEqual(capabilities)
                for (const action of ['read', 'write', 'manage'] as const)
                    await expect(workspaces.assertCan(workspaceId, action)).rejects.toBeInstanceOf(ForbiddenException)
                expect(await workspaces.findAccessibleWorkspaces(undefined, { purpose: 'authoring' })).toEqual([])
                await expect(workspaces.assertCanRun(otherWorkspaceId)).rejects.toBeInstanceOf(ForbiddenException)
                expect((await assistants.findAccessiblePublishedXperts()).map((assistant) => assistant.id)).toEqual([
                    assistantId
                ])
                expect(await assistants.countAccessiblePublishedXperts()).toBe(1)
                expect((await assistants.getAccessiblePublishedXpert(assistantId)).id).toBe(assistantId)
                expect((await assistants.getAccessiblePublishedXpertForCurrentUser(assistantId)).id).toBe(assistantId)
                await expect(assistants.getAccessiblePublishedXpert(siblingId)).rejects.toBeInstanceOf(
                    ForbiddenException
                )
                expect(await assistants.findAccessiblePublishedXperts({ where: { id: siblingId } })).toEqual([])
                expect(RequestContext.currentUserId()).toBe(user)
            })
        }
    )
    it.each(['header', 'principal', 'key'] as const)('rejects conflicting %s organization', async (source) => {
        const foreign = randomUUID()
        if (source === 'principal') actor.requestedOrganizationId = foreign
        if (source === 'key') actor.apiKey.organizationId = foreign
        await inRequest(assertDenied, source === 'header' ? foreign : undefined)
    })
    it('ignores incidental authoring role permissions when deriving workspace capabilities', async () => {
        const permission = jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(true)
        try {
            await inRequest(async () => {
                expect((await workspaces.assertCanRun(workspaceId)).capabilities).toEqual(capabilities)
                expect(await workspaces.findAccessibleWorkspaces(undefined, { purpose: 'authoring' })).toEqual([])
                await expect(workspaces.assertCanAuthor(workspaceId)).rejects.toBeInstanceOf(ForbiddenException)
                await expect(assistants.getAccessiblePublishedXpert(siblingId)).rejects.toBeInstanceOf(
                    ForbiddenException
                )
            }, org)
        } finally {
            permission.mockRestore()
        }
    })
    it.each(['unpublished', 'rebound user', 'foreign tenant', 'archived workspace', 'delivery disabled'] as const)(
        'rechecks %s for lists and point reads',
        async (change) => {
            const repository = database.getRepository(Xpert)
            try {
                if (change === 'unpublished') await repository.update(assistantId, { publishAt: null })
                if (change === 'rebound user') await repository.update(assistantId, { userId: randomUUID() })
                if (change === 'foreign tenant') await repository.update(assistantId, { tenantId: randomUUID() })
                if (change === 'archived workspace')
                    await database.getRepository(XpertWorkspace).update(workspaceId, { status: 'archived' })
                if (change === 'delivery disabled')
                    await database.query(
                        'INSERT INTO app_platform_delivery ("tenantId", "organizationId", "userId", apps) VALUES ($1,$2,$3,$4)',
                        [tenant, org, owner, '[]']
                    )
                await inRequest(assertDenied)
            } finally {
                await repository.update(assistantId, { publishAt: new Date(), userId: user, tenantId: tenant })
                await database.getRepository(XpertWorkspace).update(workspaceId, { status: null })
                await database.query('DELETE FROM app_platform_delivery')
            }
            await inRequest(async () =>
                expect((await workspaces.assertCanRun(workspaceId)).capabilities).toEqual(capabilities)
            )
        }
    )
    it.each(['revoked', 'expired', 'disabled user', 'mismatched user'] as const)(
        'denies %s credentials consistently',
        async (change) => {
            if (change === 'revoked') actor.apiKey.revokedAt = new Date()
            if (change === 'expired') actor.apiKey.validUntil = new Date(0)
            if (change === 'disabled user') actor.isActive = false
            if (change === 'mismatched user') actor.apiKeyUserId = randomUUID()
            await inRequest(assertDenied)
        }
    )
})
