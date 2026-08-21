import { AIPermissionsEnum, RolesEnum } from '@xpert-ai/contracts'
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { XpertProjectService } from '../project.service'
import { RequestContext } from '@xpert-ai/server-core'
import { XPERT_PROJECT_PERMISSION } from './project-permission.decorator'

@Injectable()
export class XpertProjectGuard implements CanActivate {
    constructor(
        private readonly service: XpertProjectService,
        private readonly reflector: Reflector
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest()
        const user = RequestContext.currentUser() ?? request.user
        const id = request.params.id

        if (!user?.id || !user.tenantId) {
            throw new ForbiddenException('An authenticated user is required')
        }

        const project = await this.service.findOne(id, { relations: ['members'] })

        if (!project) {
            throw new ForbiddenException('Xpert project not found')
        }

        const isMember = project.members?.some((member) => member.id === user.id) === true
        const isOwner = project.ownerId === user.id || project.createdById === user.id

        const organizationId = RequestContext.getOrganizationId()
        if (
            project.tenantId !== user.tenantId ||
            (organizationId ? project.organizationId !== organizationId : Boolean(project.organizationId))
        ) {
            throw new ForbiddenException('Access denied')
        }

        const permission = this.reflector.getAllAndOverride<AIPermissionsEnum>(XPERT_PROJECT_PERMISSION, [
            context.getHandler(),
            context.getClass()
        ])
        const canManage =
            permission === AIPermissionsEnum.XPERT_PROJECT_MANAGE &&
            (RequestContext.hasPermissions([AIPermissionsEnum.XPERT_PROJECT_MANAGE]) ||
                RequestContext.hasRoles([RolesEnum.SUPER_ADMIN]))
        if (!isMember && !isOwner && !canManage) {
            throw new ForbiddenException('Access denied')
        }

        return true
    }
}
