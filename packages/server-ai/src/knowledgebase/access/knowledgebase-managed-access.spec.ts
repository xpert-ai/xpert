jest.mock('../runtime/app-platform-knowledge-access', () => ({ appPlatformKnowledgeIds: jest.fn() }))
jest.mock('@xpert-ai/server-core', () => ({
    ...jest.requireActual('@xpert-ai/server-core'),
    RequestContext: jest.requireActual('@xpert-ai/plugin-sdk').RequestContext
}))
import { ForbiddenException } from '@nestjs/common'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { KnowledgebaseService } from '../management/knowledgebase.service'
import { appPlatformKnowledgeIds } from '../runtime/app-platform-knowledge-access'

function fixture() {
    const row = { id: 'assigned', workspaceId: 'authoring-workspace', createdById: 'maintenance-user' }
    const query = {
        setFindOptions: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(row)
    }
    const repository = {
        manager: {},
        createQueryBuilder: jest.fn().mockReturnValue(query),
        find: jest.fn().mockResolvedValue([row])
    }
    const workspace = { assertCan: jest.fn() }
    const service = new KnowledgebaseService(
        repository as never,
        workspace as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never
    )
    const resourceAccess = { authorize: jest.fn().mockResolvedValue(false) }
    const tenantLibraries = { find: jest.fn().mockResolvedValue(null) }
    Object.assign(service, { resourceAccess, tenantLibraries })
    return { service, row, query, repository, workspace, resourceAccess, tenantLibraries }
}

describe('managed application knowledge access', () => {
    beforeEach(() => {
        jest.mocked(appPlatformKnowledgeIds).mockResolvedValue(['assigned'])
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org')
    })
    afterEach(() => {
        jest.restoreAllMocks()
        jest.clearAllMocks()
    })

    it('reads an assigned library without granting authoring workspace membership', async () => {
        const f = fixture()
        await expect(f.service.findOne('assigned', { select: { id: true } })).resolves.toBe(f.row)
        expect(f.query.addSelect).toHaveBeenCalledWith('kb.id')
        expect(f.query.andWhere).toHaveBeenCalledWith('kb.tenantId = :tenant AND kb.organizationId = :organization', {
            tenant: 'tenant',
            organization: 'org'
        })
        expect(f.resourceAccess.authorize).toHaveBeenCalledWith('assigned', 'read')
        expect(f.workspace.assertCan).not.toHaveBeenCalled()
    })

    it('rejects an unrelated or revoked library', async () => {
        const f = fixture()
        jest.mocked(appPlatformKnowledgeIds).mockResolvedValue([])
        await expect(f.service.findOne('assigned')).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('enforces resource authorization even when resourceRef is omitted from the selected fields', async () => {
        const f = fixture()
        f.resourceAccess.authorize.mockRejectedValue(new ForbiddenException())
        await expect(f.service.findOne('assigned', { select: { id: true } })).rejects.toBeInstanceOf(ForbiddenException)
        expect(f.resourceAccess.authorize).toHaveBeenCalledWith('assigned', 'read')
    })

    it('allows a separately authorized resource library outside the application library list', async () => {
        const f = fixture()
        jest.mocked(appPlatformKnowledgeIds).mockResolvedValue([])
        f.resourceAccess.authorize.mockResolvedValue(true)
        await expect(f.service.findOne('assigned')).resolves.toBe(f.row)
    })

    it('does not query rows when no application libraries are available', async () => {
        const f = fixture()
        jest.mocked(appPlatformKnowledgeIds).mockResolvedValue([])
        await expect(f.service.getAllByWorkspace('workspace', {}, true, { id: 'user' } as never)).resolves.toEqual({
            items: [],
            total: 0
        })
        expect(f.repository.find).not.toHaveBeenCalled()
    })

    it('limits library discovery to the assigned IDs and current tenant and organization', async () => {
        const f = fixture()
        await expect(
            f.service.getAllByWorkspace('workspace', { take: 10 }, true, { id: 'user' } as never)
        ).resolves.toEqual({ items: [f.row], total: 1 })
        expect(appPlatformKnowledgeIds).toHaveBeenCalledWith(f.repository.manager, 'workspace')
        expect(f.repository.find).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    tenantId: 'tenant',
                    organizationId: 'org',
                    id: expect.anything(),
                    publishAt: expect.anything()
                }),
                take: 10
            })
        )
    })

    it('omits assigned libraries whose resource policy denies reading', async () => {
        const f = fixture()
        f.resourceAccess.authorize.mockRejectedValue(new ForbiddenException())
        await expect(f.service.getAllByWorkspace('workspace', {}, true, { id: 'user' } as never)).resolves.toEqual({
            items: [],
            total: 0
        })
    })

    it('allows writes to the assigned application library without authoring workspace access', async () => {
        const f = fixture()
        await expect(f.service.assertKnowledgebaseWriteAccess('assigned')).resolves.toBe(f.row)
        expect(f.resourceAccess.authorize).toHaveBeenCalledWith('assigned', 'write')
        expect(f.workspace.assertCan).not.toHaveBeenCalled()
    })

    it('retains resource write denial even for an assigned library', async () => {
        const f = fixture()
        f.resourceAccess.authorize.mockResolvedValueOnce(true).mockRejectedValueOnce(new ForbiddenException())
        await expect(f.service.assertKnowledgebaseWriteAccess('assigned')).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('retains the ordinary tenant library lookup when the account is not enrolled', async () => {
        const f = fixture()
        jest.mocked(appPlatformKnowledgeIds).mockResolvedValue(null)
        f.tenantLibraries.find.mockResolvedValue(f.row)
        await expect(f.service.findOne('assigned')).resolves.toBe(f.row)
        expect(f.repository.createQueryBuilder).not.toHaveBeenCalled()
    })
})
