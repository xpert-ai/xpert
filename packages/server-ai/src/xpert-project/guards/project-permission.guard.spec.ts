import { AIPermissionsEnum, IUser } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { XpertProjectAccessService } from '../services/project-access.service'
import { XpertProjectPermissionGuard } from './project-permission.guard'
import { ProjectPermission } from './project-permission.decorator'
import { PERMISSIONS_METADATA } from '@xpert-ai/server-common'

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

    it('allows a Project owner without requiring a tenant-wide management grant', async () => {
        @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_VIEW)
        class ProjectEndpoints {
            @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_MANAGE)
            archive() {}
        }
        const metadata = new Reflector()
        const target = [ProjectEndpoints.prototype.archive, ProjectEndpoints]
        const grant = jest.spyOn(RequestContext, 'hasPermissions').mockReturnValue(false)
        accessService.assertCanManage.mockResolvedValue({ project: { id: 'project-1' }, role: 'owner' })
        const endpointContext = {
            ...context,
            getHandler: () => target[0],
            getClass: () => target[1]
        } as unknown as ExecutionContext
        const guard = new XpertProjectPermissionGuard(metadata, accessService as unknown as XpertProjectAccessService)
        await expect(guard.canActivate(endpointContext)).resolves.toBe(true)
        expect(accessService.assertCanManage).toHaveBeenCalledWith('project-1')
        expect(grant).not.toHaveBeenCalled()
        // The endpoint interceptor must not apply a second tenant-wide decision.
        expect(metadata.getAllAndOverride(PERMISSIONS_METADATA, target)).toBeUndefined()

        accessService.assertCanManage.mockRejectedValue(new ForbiddenException('Project manager access is required'))
        await expect(guard.canActivate(endpointContext)).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('still denies a collection operation without its global grant', async () => {
        reflector.getAllAndOverride.mockReturnValue(AIPermissionsEnum.XPERT_PROJECT_CREATE)
        jest.spyOn(RequestContext, 'hasPermissions').mockReturnValue(false)
        const collectionContext = {
            ...context,
            switchToHttp: () => ({ getRequest: () => ({ params: {} }) })
        } as unknown as ExecutionContext
        const guard = new XpertProjectPermissionGuard(
            reflector as unknown as Reflector,
            accessService as unknown as XpertProjectAccessService
        )
        await expect(guard.canActivate(collectionContext)).rejects.toBeInstanceOf(ForbiddenException)
        expect(accessService.assertCanRead).not.toHaveBeenCalled()
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
