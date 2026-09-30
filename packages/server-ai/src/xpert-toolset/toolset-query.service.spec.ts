import { ForbiddenException } from '@nestjs/common'
import { runWithRequestContext } from '@xpert-ai/server-core'
import { Repository } from 'typeorm'
import { XpertToolset } from './xpert-toolset.entity'
import { XpertWorkspaceAccessService } from '../xpert-workspace/workspace-access.service'
import { ToolsetQueryService } from './toolset-query.service'

describe('ToolsetQueryService', () => {
    afterEach(() => jest.restoreAllMocks())

    function fixture() {
        const record = { id: 'entity-1', tenantId: 'tenant-1', workspaceId: 'workspace-1' }
        const repository = { findOne: jest.fn().mockImplementation(async () => ({ ...record })) }
        const access = { assertCan: jest.fn().mockResolvedValue({ workspace: record }) }
        const service = new ToolsetQueryService(
            repository as unknown as Repository<XpertToolset>,
            access as unknown as XpertWorkspaceAccessService
        )
        return { service, repository, access }
    }

    function inTenantScope(work: () => Promise<void>): Promise<void> {
        return new Promise((resolve, reject) => {
            runWithRequestContext({ user: { tenantId: 'tenant-1' } }, () => {
                work().then(resolve, reject)
            })
        })
    }

    it('retains read and runtime permission checks without exposing legacy writes', () =>
        inTenantScope(async () => {
            const { service, access } = fixture()
            access.assertCan.mockImplementation(async (_id, action) => {
                if (action === 'read') throw new ForbiddenException()
                return { workspace: { id: 'workspace-1', tenantId: 'tenant-1', workspaceId: 'workspace-1' } }
            })
            await expect(service.findOne('entity-1')).rejects.toBeInstanceOf(ForbiddenException)
            await expect(service.findOneForRuntime('entity-1')).resolves.toMatchObject({ id: 'entity-1' })
            expect(access.assertCan).toHaveBeenCalledWith('workspace-1', 'run')
            expect('update' in service).toBe(false)
            expect('create' in service).toBe(false)
        }))

    it('adds scope fields for authorization and removes them from a narrow query result', () =>
        inTenantScope(async () => {
            const { service, repository, access } = fixture()
            expect(await service.findOneByIdString('entity-1', { select: { id: true } })).toEqual({ id: 'entity-1' })
            expect(repository.findOne).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: 'entity-1', tenantId: 'tenant-1' },
                    select: { id: true, tenantId: true, organizationId: true, workspaceId: true }
                })
            )
            expect(access.assertCan).toHaveBeenCalledWith('workspace-1', 'read')
        }))
})
