import { BadRequestException, CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { isUUID } from 'class-validator'
import { t } from 'i18next'
import { XpertWorkspaceAccessService } from '../workspace-access.service'

@Injectable()
export class WorkspaceAuthoringGuard implements CanActivate {
    constructor(private readonly workspaceAccessService: XpertWorkspaceAccessService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest()
        const workspaceId = request.params.workspaceId

        if (!isUUID(workspaceId)) {
            throw new BadRequestException(
                t('server-ai:Error.WorkspaceIdInvalid', { defaultValue: 'A valid Workspace ID is required.' })
            )
        }

        await this.workspaceAccessService.assertCanAuthor(workspaceId)

        return true
    }
}
