import { AIPermissionsEnum, IUser } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { XpertProjectAccessService } from '../services/project-access.service'
import { XpertProjectPermissionGuard } from './project-permission.guard'

describe('XpertProjectPermissionGuard', () => {
    const accessService = {
        assertCanRead: jest.fn(),
        assertCanEdit: jest.fn(),
        assertCanManage: jest.fn()
    }
    const reflector = {
        getAllAndOverride: jest.fn()
    }
    const context = {
        getHandler: jest.fn(),
        getClass: jest.fn(),
        switchToHttp: () => ({
            getRequest: () => ({ params: { id: 'project-1' } })
        })
    } as unknown as ExecutionContext

    beforeEach(() => {
        jest.clearAllMocks()
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ id: 'user-1', tenantId: 'tenant-1' } as never)
        reflector.getAllAndOverride.mockReturnValue(AIPermissionsEnum.XPERT_PROJECT_CREATE)
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('allows Project catalogs when the authenticated role contains duplicate view grants', async () => {
        reflector.getAllAndOverride.mockReturnValue(AIPermissionsEnum.XPERT_PROJECT_VIEW)
        jest.mocked(RequestContext.currentUser).mockReturnValue({
            id: 'user-1',
            tenantId: 'tenant-1',
            role: {
                rolePermissions: [
                    { permission: AIPermissionsEnum.XPERT_PROJECT_VIEW, enabled: true },
                    { permission: AIPermissionsEnum.XPERT_PROJECT_VIEW, enabled: true }
                ]
            }
        } as IUser)
        const collectionContext = {
            ...context,
            switchToHttp: () => ({ getRequest: () => ({ params: {} }) })
        } as unknown as ExecutionContext
        const guard = new XpertProjectPermissionGuard(
            reflector as unknown as Reflector,
            accessService as unknown as XpertProjectAccessService
        )

        await expect(guard.canActivate(collectionContext)).resolves.toBe(true)
        expect(accessService.assertCanRead).not.toHaveBeenCalled()
    })

    it('requires both collection create permission and read access to duplicate a Project', async () => {
        jest.spyOn(RequestContext, 'hasPermissions').mockReturnValue(false)
        const guard = new XpertProjectPermissionGuard(
            reflector as unknown as Reflector,
            accessService as unknown as XpertProjectAccessService
        )

        await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException)
        expect(RequestContext.hasPermissions).toHaveBeenCalledWith([AIPermissionsEnum.XPERT_PROJECT_CREATE])
        expect(accessService.assertCanRead).not.toHaveBeenCalled()

        jest.mocked(RequestContext.hasPermissions).mockReturnValue(true)
        accessService.assertCanRead.mockResolvedValue({ project: { id: 'project-1' }, role: 'viewer' })

        await expect(guard.canActivate(context)).resolves.toBe(true)
        expect(accessService.assertCanRead).toHaveBeenCalledWith('project-1')
    })
})
