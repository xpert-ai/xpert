import { KnowledgebasePermission } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { TenantOrganizationAwareCrudService } from '@xpert-ai/server-core'
import { Brackets } from 'typeorm'
import { KnowledgeDocumentChunkService } from './chunk.service'

describe('tenant library chunk reads', () => {
    beforeEach(() => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('reader')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('organization')
    })
    afterEach(() => jest.restoreAllMocks())
    function fixture() {
        const query = {
            setFindOptions: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            getManyAndCount: jest.fn().mockResolvedValue([[{ id: 'chunk' }], 1])
        }
        const repository = { createQueryBuilder: jest.fn().mockReturnValue(query) }
        return { query, repository, service: new KnowledgeDocumentChunkService(repository as never) }
    }
    it('keeps tenant, current organization and explicitly public tenant-library predicates on chunk reads', async () => {
        const f = fixture(),
            options = { where: { knowledgebaseId: 'library' }, relations: ['document'] }
        await expect(f.service.findAll(options)).resolves.toEqual({ items: [{ id: 'chunk' }], total: 1 })
        expect(f.query.setFindOptions).toHaveBeenCalledWith(options)
        expect(f.query.andWhere).toHaveBeenCalledWith('document.tenantId = :libraryReadTenantId', {
            libraryReadTenantId: 'tenant'
        })
        const bracket = f.query.andWhere.mock.calls.find(([value]) => value instanceof Brackets)?.[0] as Brackets
        const predicates = { where: jest.fn().mockReturnThis(), orWhere: jest.fn().mockReturnThis() }
        expect(typeof bracket.whereFactory).toBe('function')
        if (typeof bracket.whereFactory === 'function') bracket.whereFactory(predicates as never)
        expect(predicates.where).toHaveBeenCalledWith('document.organizationId = :libraryReadOrganizationId', {
            libraryReadOrganizationId: 'organization'
        })
        expect(predicates.orWhere).toHaveBeenCalledWith(
            expect.stringMatching(/tenant_library.*tenantId[\s\S]*organizationId[\s\S]*workspaceId[\s\S]*permission/),
            { libraryReadPermission: KnowledgebasePermission.Public }
        )
        expect(RequestContext.getOrganizationId()).toBe('organization')
    })
    it.each(['tenant', 'anonymous'])('retains the existing CRUD access boundary for %s context', async (kind) => {
        if (kind === 'tenant') jest.mocked(RequestContext.getOrganizationId).mockReturnValue(null)
        else jest.mocked(RequestContext.currentUserId).mockReturnValue(undefined)
        const fallback = jest
            .spyOn(TenantOrganizationAwareCrudService.prototype, 'findAll')
            .mockResolvedValue({ items: [], total: 0 })
        const f = fixture()
        await expect(f.service.findAll()).resolves.toEqual({ items: [], total: 0 })
        expect(fallback).toHaveBeenCalled()
        expect(f.repository.createQueryBuilder).not.toHaveBeenCalled()
    })
})
