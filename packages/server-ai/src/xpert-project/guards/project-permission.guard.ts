import { AIPermissionsEnum, RolesEnum } from '@xpert-ai/contracts'
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { RequestContext } from '@xpert-ai/server-core'
import { XPERT_PROJECT_PERMISSION } from './project-permission.decorator'
import { XpertProjectService } from '../project.service'

@Injectable()
export class XpertProjectPermissionGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly service: XpertProjectService
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const permission = this.reflector.getAllAndOverride<AIPermissionsEnum>(XPERT_PROJECT_PERMISSION, [
            context.getHandler(),
            context.getClass()
        ])
        if (!permission) {
            return true
        }

        const user = RequestContext.currentUser()
        if (!user?.id || !user.tenantId) {
            throw new ForbiddenException('An authenticated user is required')
        }

        const projectId = context.switchToHttp().getRequest<{ params?: { id?: string } }>().params?.id
        if (!projectId) {
            if (!RequestContext.hasPermissions([permission])) {
                throw new ForbiddenException('Project permission is required')
            }
            return true
        }

        const project = await this.service.findOne(projectId, { relations: ['members'] })
        const organizationId = RequestContext.getOrganizationId()
        if (
            !project ||
            project.tenantId !== user.tenantId ||
            (organizationId ? project.organizationId !== organizationId : Boolean(project.organizationId))
        ) {
            throw new ForbiddenException('Project is not available in the current scope')
        }

        const isOwner = project.ownerId === user.id || project.createdById === user.id
        const isMember = project.members?.some((member) => member.id === user.id) === true
        const isSuperAdmin = RequestContext.hasRoles([RolesEnum.SUPER_ADMIN])
        const isProjectManager = RequestContext.hasPermissions([AIPermissionsEnum.XPERT_PROJECT_MANAGE])
        if (!isOwner && !isMember && permission !== AIPermissionsEnum.XPERT_PROJECT_MANAGE) {
            throw new ForbiddenException('Project membership is required')
        }
        if (
            !isOwner &&
            !isMember &&
            permission === AIPermissionsEnum.XPERT_PROJECT_MANAGE &&
            !isProjectManager &&
            !isSuperAdmin
        ) {
            throw new ForbiddenException('Project membership or manage permission is required')
        }

        // Owners have full authority inside their own project. Other members
        // must hold the exact single permission attached to the endpoint.
        if (isOwner || isSuperAdmin) {
            return true
        }
        if (!RequestContext.hasPermissions([permission])) {
            throw new ForbiddenException('Project permission is required')
        }
        return true
    }
}
