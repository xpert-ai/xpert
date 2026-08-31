import { AIPermissionsEnum } from '@xpert-ai/contracts'
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { RequestContext } from '@xpert-ai/server-core'
import { XPERT_PROJECT_PERMISSION } from './project-permission.decorator'
import { XpertProjectAccessService } from '../services/project-access.service'
import { t } from 'i18next'

@Injectable()
export class XpertProjectGuard implements CanActivate {
    constructor(
        private readonly accessService: XpertProjectAccessService,
        private readonly reflector: Reflector
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest()
        const user = RequestContext.currentUser() ?? request.user
        const id = request.params.id

        if (!user?.id || !user.tenantId) {
            throw new ForbiddenException(
                t('server-ai:Error.AuthenticatedUserRequired', { defaultValue: 'An authenticated user is required' })
            )
        }

        const permission = this.reflector.getAllAndOverride<AIPermissionsEnum>(XPERT_PROJECT_PERMISSION, [
            context.getHandler(),
            context.getClass()
        ])
        if (permission === AIPermissionsEnum.XPERT_PROJECT_MANAGE) await this.accessService.assertCanManage(id)
        else if (permission === AIPermissionsEnum.XPERT_PROJECT_EDIT) await this.accessService.assertCanEdit(id)
        else await this.accessService.assertCanRead(id)

        return true
    }
}
