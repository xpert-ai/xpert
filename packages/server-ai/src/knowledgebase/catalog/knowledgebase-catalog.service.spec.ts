import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { KnowledgebasePermission, RolesEnum } from '@xpert-ai/contracts'
import { RequestContext, type KnowledgebaseQuery } from '@xpert-ai/plugin-sdk'
import { Repository, SelectQueryBuilder } from 'typeorm'
import { Knowledgebase } from '../knowledgebase.entity'
import { XpertWorkspace } from '../../xpert-workspace/workspace.entity'
import { XpertWorkspaceAccessService } from '../../xpert-workspace/workspace-access.service'
import { KnowledgebaseCatalogAccessService } from './knowledgebase-catalog-access.service'
import { KnowledgebaseCatalogService } from './knowledgebase-catalog.service'

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const tenant = uuid(9001),
    org = uuid(9002),
    userId = uuid(9003),
    ws = uuid(9004)
const owned: KnowledgebaseQuery = { scope: { kind: 'workspace', workspaceId: ws, relation: 'owned' } }
const row = (n: number, patch: Partial<Knowledgebase> = {}) =>
    Object.assign(new Knowledgebase(), {
        id: uuid(n),
        tenantId: tenant,
        organizationId: org,
        workspaceId: ws,
        createdById: userId,
        name: `Library ${n}`,
        permission: KnowledgebasePermission.Organization,
        applicationTags: ['image'],
        ...patch
    })

afterEach(() => jest.restoreAllMocks())
function fixture(initial: Knowledgebase[] = [row(1), row(2), row(3)]) {
    const user = { id: userId, tenantId: tenant, role: { name: RolesEnum.VIEWER } } as ReturnType<
        typeof RequestContext.currentUser
    >
    jest.spyOn(RequestContext, 'currentUser').mockReturnValue(user)
    jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(userId)
    jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(tenant)
    jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(org)
    jest.spyOn(RequestContext, 'isTenantScope').mockReturnValue(false)
    jest.spyOn(RequestContext, 'hasRole').mockReturnValue(false)
    jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue(null)
    let rows = initial
    let spaces: XpertWorkspace[] = [
        Object.assign(new XpertWorkspace(), {
            id: ws,
            tenantId: tenant,
            organizationId: org,
            ownerId: userId,
            status: 'active',
            members: []
        })
    ]
    const workspaceRepository = Object.create(Repository.prototype) as Repository<XpertWorkspace>
    const workspaceFind = jest.spyOn(workspaceRepository, 'find').mockImplementation(async () => spaces)
    jest.spyOn(workspaceRepository, 'findOne').mockImplementation(async () => spaces[0] ?? null)
    const workspaces = new XpertWorkspaceAccessService(workspaceRepository)
    const access = new KnowledgebaseCatalogAccessService(workspaces, { authorizeReference: jest.fn() } as never)
    const repository = Object.create(Repository.prototype) as Repository<Knowledgebase>
    const statements: Array<{ sql: unknown; params?: object }> = []
    const pageReads: Array<string | undefined> = []
    // Provider seam: execute only keyset/ID paging here; SQL scope/filter bindings are asserted separately.
    const builder = (state: { after?: string; ids?: string[]; take?: number } = {}) => {
        const q = Object.create(SelectQueryBuilder.prototype) as SelectQueryBuilder<Knowledgebase>
        jest.spyOn(q, 'select').mockReturnValue(q)
        jest.spyOn(q, 'orderBy').mockReturnValue(q)
        jest.spyOn(q, 'where').mockImplementation((sql, params) => {
            statements.push({ sql, params })
            return q
        })
        jest.spyOn(q, 'andWhere').mockImplementation((sql, params) => {
            statements.push({ sql, params })
            if (typeof params?.after === 'string') state.after = params.after
            if (Array.isArray(params?.ids)) state.ids = params.ids
            return q
        })
        jest.spyOn(q, 'take').mockImplementation((take) => {
            state.take = take
            return q
        })
        jest.spyOn(q, 'clone').mockImplementation(() => builder({ ...state }))
        jest.spyOn(q, 'getMany').mockImplementation(async () => {
            pageReads.push(state.after)
            return rows
                .filter((r) => (!state.after || r.id > state.after) && (!state.ids || state.ids.includes(r.id)))
                .sort((a, b) => a.id.localeCompare(b.id))
                .slice(0, state.take)
        })
        return q
    }
    jest.spyOn(repository, 'createQueryBuilder').mockImplementation(() => builder())
    return {
        service: new KnowledgebaseCatalogService(repository, access),
        access,
        workspaces,
        statements,
        pageReads,
        workspaceFind,
        setRows: (value: Knowledgebase[]) => {
            rows = value
        },
        setSpaces: (value: XpertWorkspace[]) => {
            spaces = value
        }
    }
}

describe('knowledgebase catalog authorization and pagination', () => {
    it('uses stable keysets without duplicates when earlier rows are inserted or deleted', async () => {
        const f = fixture()
        const first = await f.service.query({ ...owned, page: { limit: 1 } })
        expect(first.items.map((x) => x.id)).toEqual([uuid(1)])
        f.setRows([row(0), row(2), row(3)])
        const second = await f.service.query({ ...owned, page: { limit: 1, cursor: first.nextCursor! } })
        const third = await f.service.query({ ...owned, page: { limit: 1, cursor: second.nextCursor! } })
        expect([...second.items, ...third.items].map((x) => x.id)).toEqual([uuid(2), uuid(3)])
        expect(third.nextCursor).toBeNull()
        expect(f.pageReads).toEqual([undefined, uuid(1), uuid(2)])
    })

    it('advances across denied rows and bounds each scan, including empty continuation pages', async () => {
        const denied = Array.from({ length: 1000 }, (_, n) =>
            row(n + 1, { workspaceId: null, createdById: 'other', permission: KnowledgebasePermission.Private })
        )
        const f = fixture([...denied, row(1001)])
        const first = await f.service.query({
            scope: { kind: 'organization' },
            access: { requireAll: ['documents.create'] },
            page: { limit: 1 }
        })
        expect(first.items).toEqual([])
        expect(first.nextCursor).not.toBeNull()
        const second = await f.service.query({
            scope: { kind: 'organization' },
            access: { requireAll: ['documents.create'] },
            page: { limit: 1, cursor: first.nextCursor! }
        })
        expect(second.items.map((x) => x.id)).toEqual([uuid(1001)])
        expect(second.nextCursor).toBeNull()
        expect(f.pageReads).toHaveLength(11)
    })

    it('revalidates membership and binds cursors to the actor, scope, and filters', async () => {
        const f = fixture(),
            first = await f.service.query({ ...owned, page: { limit: 1 } })
        for (const changed of [
            { ...owned, filter: { visibility: 'private' as const } },
            { scope: { kind: 'organization' as const } },
            { ...owned, access: { requireAll: ['documents.create' as const] } }
        ])
            await expect(f.service.query({ ...changed, page: { cursor: first.nextCursor! } })).rejects.toThrow(
                BadRequestException
            )
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ id: 'new-user', tenantId: tenant } as ReturnType<
            typeof RequestContext.currentUser
        >)
        await expect(
            f.service.query({ scope: { kind: 'organization' }, page: { cursor: first.nextCursor! } })
        ).rejects.toThrow(BadRequestException)
        await expect(f.service.query(owned)).rejects.toThrow(NotFoundException)
    })

    it('does not reveal foreign tenants, organizations, private owners or archived workspaces', async () => {
        const f = fixture([
            row(1, { tenantId: 'foreign' }),
            row(2, { organizationId: 'foreign' }),
            row(3, { workspaceId: null, createdById: 'other', permission: KnowledgebasePermission.Private }),
            row(4)
        ])
        f.setSpaces([
            Object.assign(new XpertWorkspace(), {
                id: ws,
                tenantId: tenant,
                organizationId: org,
                ownerId: userId,
                status: 'archived'
            })
        ])
        const result = await f.service.getAccess({
            knowledgebaseIds: [1, 2, 3, 4, 5].map(uuid),
            actions: ['knowledgebase.read', 'documents.create']
        })
        expect(
            result.items.every((item) => item.status === 'unavailable' && item.actions.every((a) => !a.allowed))
        ).toBe(true)
        for (const id of [1, 2, 3, 4, 5])
            await expect(f.service.get({ knowledgebaseId: uuid(id) })).rejects.toThrow(NotFoundException)
    })

    it('uses actual workspace policy for API-bound read-only access and membership', async () => {
        const f = fixture()
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue({
            resourceScope: { kind: 'workspace', workspaceId: ws }
        } as ReturnType<typeof RequestContext.currentApiPrincipal>)
        const actions = ['knowledgebase.read', 'documents.create', 'documents.process', 'knowledgebase.manage'] as const
        const result = await f.service.getAccess({ knowledgebaseIds: [uuid(1)], actions: [...actions] })
        expect(result.items[0].actions.map((a) => a.allowed)).toEqual([true, false, false, false])
        expect((await f.service.query({ ...owned, access: { requireAll: ['documents.create'] } })).items).toEqual([])
        await expect(f.workspaces.assertCanWrite(ws)).rejects.toThrow() // point authorization is also denied
    })

    it('allows organization members to write without treating SUPER_ADMIN as workspace membership', async () => {
        const f = fixture()
        const space = Object.assign(new XpertWorkspace(), {
            id: ws,
            tenantId: tenant,
            organizationId: org,
            ownerId: 'other',
            members: [{ id: userId }]
        })
        f.setSpaces([space])
        expect(
            (await f.service.getAccess({ knowledgebaseIds: [uuid(1)], actions: ['documents.create'] })).items[0]
                .actions[0].allowed
        ).toBe(true)
        f.setSpaces([{ ...space, members: [] }])
        jest.spyOn(RequestContext, 'hasRole').mockReturnValue(true)
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({
            id: userId,
            tenantId: tenant,
            role: { name: RolesEnum.SUPER_ADMIN }
        } as ReturnType<typeof RequestContext.currentUser>)
        expect(
            (await f.service.getAccess({ knowledgebaseIds: [uuid(1)], actions: ['documents.create'] })).items[0].status
        ).toBe('unavailable')
    })

    it('permits tenant-library reading, but writing requires SUPER_ADMIN in tenant scope', async () => {
        const f = fixture([
            row(1, { workspaceId: null, organizationId: null, permission: KnowledgebasePermission.Public })
        ])
        const input = { knowledgebaseIds: [uuid(1)], actions: ['knowledgebase.read', 'documents.create'] as const }
        expect(
            (await f.service.getAccess({ ...input, actions: [...input.actions] })).items[0].actions.map(
                (a) => a.allowed
            )
        ).toEqual([true, false])
        jest.spyOn(RequestContext, 'hasRole').mockReturnValue(true)
        expect((await f.service.getAccess({ ...input, actions: [...input.actions] })).items[0].actions[1].allowed).toBe(
            false
        )
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(undefined)
        jest.spyOn(RequestContext, 'isTenantScope').mockReturnValue(true)
        expect(
            (await f.service.query({ scope: { kind: 'tenant' }, access: { requireAll: ['documents.create'] } })).items
        ).toHaveLength(1)
    })

    it('requires context, rejects malformed input and keeps processing readiness separate from permission', async () => {
        const f = fixture([row(1, { copilotModelId: null })])
        expect(await f.service.get({ knowledgebaseId: uuid(1) })).toMatchObject({
            processing: { blocked: true, reason: 'embedding_not_configured' }
        })
        expect(
            (await f.service.getAccess({ knowledgebaseIds: [uuid(1)], actions: ['documents.process'] })).items[0]
                .actions[0].allowed
        ).toBe(true)
        await expect(f.service.query({ ...owned, page: { limit: 101 } })).rejects.toThrow(BadRequestException)
        await expect(f.service.query({ ...owned, page: { cursor: 'broken' } })).rejects.toThrow(BadRequestException)
        await expect(f.service.query({ ...owned, userId: 'forged' } as KnowledgebaseQuery)).rejects.toThrow(
            BadRequestException
        )
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(undefined)
        await expect(f.service.query(owned)).rejects.toThrow(ForbiddenException)
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue(null)
        await expect(
            f.service.getAccess({ knowledgebaseIds: [uuid(1)], actions: ['documents.create'] })
        ).rejects.toThrow(ForbiddenException)
    })

    it('pushes scope and literal filters into bounded provider queries and returns an allowlisted DTO', async () => {
        const f = fixture([row(1, { copilotModelId: 'secret-model-binding' })])
        const result = await f.service.query({
            scope: { kind: 'organization' },
            filter: {
                text: 'image%_',
                visibility: 'organization',
                applicationTags: { allOf: ['image'] },
                publication: 'unpublished'
            }
        })
        expect(f.statements).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ sql: 'kb.tenantId = :tenantId', params: { tenantId: tenant } }),
                expect.objectContaining({
                    sql: 'kb.organizationId = :organizationId',
                    params: { organizationId: org }
                }),
                expect.objectContaining({
                    sql: 'kb.applicationTags @> CAST(:tags AS jsonb)',
                    params: { tags: '["image"]' }
                }),
                expect.objectContaining({ sql: 'kb.publishAt IS NULL' }),
                expect.objectContaining({ params: { text: '%image\\%\\_%' } })
            ])
        )
        expect(JSON.stringify(result)).not.toContain('secret')
        expect(JSON.stringify(await f.service.get({ knowledgebaseId: uuid(1) }))).not.toContain('secret')
        expect(f.workspaceFind).toHaveBeenCalledWith(expect.objectContaining({ relations: { members: true } }))
    })
})
