import { FindManyOptions, FindOptionsWhere, In, IsNull, Repository } from 'typeorm'
import { RequestContext } from '@xpert-ai/server-core'
import { WorkspaceBaseEntity } from '../core/entities/base.entity'
import { XpertWorkspaceAccessService } from './workspace-access.service'
import { XpertWorkspaceBaseService } from './workspace-base.service'

describe('XpertWorkspaceBaseService', () => {
    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('queries tenant-level records from the requested tenant workspace in organization scope', async () => {
        const findAndCount = jest.fn().mockResolvedValue([[], 0])
        const repository = {
            findAndCount
        } as Pick<Repository<WorkspaceBaseEntity>, 'findAndCount'>
        const assertCan = jest.fn().mockResolvedValue({
            workspace: {
                id: 'workspace-1',
                tenantId: 'tenant-1',
                organizationId: null
            },
            capabilities: {
                canRead: true,
                canRun: true,
                canWrite: false,
                canManage: false
            },
            isTenantShared: true
        })
        const workspaceAccessService = {
            assertCan
        } as Pick<XpertWorkspaceAccessService, 'assertCan'>
        const service = new XpertWorkspaceBaseService(
            repository as Repository<WorkspaceBaseEntity>,
            workspaceAccessService as XpertWorkspaceAccessService
        )

        await service.findAll({
            where: {
                id: In(['toolset-1']),
                workspaceId: 'workspace-1'
            } as FindOptionsWhere<WorkspaceBaseEntity>
        })

        expect(assertCan).toHaveBeenCalledWith('workspace-1', 'read')
        const scopedOptions = findAndCount.mock.calls[0][0] as FindManyOptions<WorkspaceBaseEntity>
        const scopedWhere = scopedOptions.where as FindOptionsWhere<WorkspaceBaseEntity>
        expect(scopedWhere.workspaceId).toBe('workspace-1')
        expect(scopedWhere.tenantId).toBe('tenant-1')
        expect(scopedWhere.organizationId).toEqual(IsNull())
    })

    it('keeps findOne readable when select omits scope fields', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')

        const findOne = jest.fn().mockResolvedValue({
            id: 'xpert-1',
            createdById: 'user-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            workspaceId: null
        })
        const repository = {
            findOne
        } as Pick<Repository<WorkspaceBaseEntity>, 'findOne'>
        const assertCan = jest.fn()
        const workspaceAccessService = {
            assertCan
        } as Pick<XpertWorkspaceAccessService, 'assertCan'>
        const service = new XpertWorkspaceBaseService(
            repository as Repository<WorkspaceBaseEntity>,
            workspaceAccessService as XpertWorkspaceAccessService
        )

        const result = await service.findOne('xpert-1', {
            select: ['id', 'createdById'] as never
        })

        const options = findOne.mock.calls[0][0]
        expect(options.select).toEqual(['id', 'createdById', 'tenantId', 'organizationId', 'workspaceId'])
        expect(options.where).toEqual({
            id: 'xpert-1',
            tenantId: 'tenant-1'
        })
        expect(assertCan).not.toHaveBeenCalled()
        expect(result).toEqual({
            id: 'xpert-1',
            createdById: 'user-1'
        })
    })
})
