import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common'
import { XpertProjectService } from '../project.service'
import { RequestContext } from '@xpert-ai/server-core'

@Injectable()
export class XpertProjectOwnerGuard implements CanActivate {
    constructor(private readonly service: XpertProjectService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest()
        const user = RequestContext.currentUser() ?? request.user
        const id = request.params.id

        if (!user?.id || !user.tenantId) {
            throw new ForbiddenException('An authenticated user is required')
        }

        const project = await this.service.findOne(id)

        if (!project) {
            throw new ForbiddenException('Xpert project not found')
        }

        const organizationId = RequestContext.getOrganizationId()
        const isOwner =
            (project.ownerId === user.id || project.createdById === user.id) &&
            project.tenantId === user.tenantId &&
            (organizationId ? project.organizationId === organizationId : !project.organizationId)

        if (!isOwner) {
            throw new ForbiddenException('Access denied')
        }

        return true
    }
}
