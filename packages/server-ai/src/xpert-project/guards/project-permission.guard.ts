import { AIPermissionsEnum } from '@xpert-ai/contracts'
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { RequestContext } from '@xpert-ai/server-core'
import { XPERT_PROJECT_PERMISSION } from './project-permission.decorator'
import { XpertProjectAccessService } from '../services/project-access.service'
import { t } from 'i18next'

@Injectable()
export class XpertProjectPermissionGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly accessService: XpertProjectAccessService
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
            throw new ForbiddenException(
                t('server-ai:Error.AuthenticatedUserRequired', { defaultValue: 'An authenticated user is required' })
            )
        }

        const projectId = context.switchToHttp().getRequest<{ params?: { id?: string } }>().params?.id
        if (!projectId) {
            if (!RequestContext.hasPermissions([permission])) {
                throw new ForbiddenException(
                    t('server-ai:Error.ProjectPermissionRequired', {
                        defaultValue: 'Project permission is required'
                    })
                )
            }
            return true
        }

        if (permission === AIPermissionsEnum.XPERT_PROJECT_CREATE) {
            if (!RequestContext.hasPermissions([permission])) {
                throw new ForbiddenException(
                    t('server-ai:Error.ProjectPermissionRequired', {
                        defaultValue: 'Project permission is required'
                    })
                )
            }
            await this.accessService.assertCanRead(projectId)
        } else if (permission === AIPermissionsEnum.XPERT_PROJECT_MANAGE) {
            await this.accessService.assertCanManage(projectId)
        } else if (permission === AIPermissionsEnum.XPERT_PROJECT_EDIT) {
            await this.accessService.assertCanEdit(projectId)
        } else {
            await this.accessService.assertCanRead(projectId)
        }
        return true
    }
}
