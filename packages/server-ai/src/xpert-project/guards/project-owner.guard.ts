import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common'
import { XpertProjectAccessService } from '../services/project-access.service'
import { RequestContext } from '@xpert-ai/server-core'
import { t } from 'i18next'

@Injectable()
export class XpertProjectOwnerGuard implements CanActivate {
    constructor(private readonly accessService: XpertProjectAccessService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest()
        const user = RequestContext.currentUser() ?? request.user
        const id = request.params.id

        if (!user?.id || !user.tenantId) {
            throw new ForbiddenException(
                t('server-ai:Error.AuthenticatedUserRequired', { defaultValue: 'An authenticated user is required' })
            )
        }

        const access = await this.accessService.assertCanRead(id)
        if (access.role !== 'owner') {
            throw new ForbiddenException(
                t('server-ai:Error.ProjectOwnerRequired', { defaultValue: 'Project owner access is required' })
            )
        }

        return true
    }
}
