import { FindManyOptions, FindOptionsWhere, In, IsNull, Repository } from 'typeorm'
import { WorkspaceBaseEntity } from '../core/entities/base.entity'
import { XpertWorkspaceAccessService } from './workspace-access.service'
import { XpertWorkspaceBaseService } from './workspace-base.service'

describe('XpertWorkspaceBaseService', () => {
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
})
