import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { Request } from 'express'
import { t } from 'i18next'
import { SandboxPreviewSessionService } from './sandbox-preview-session.service'

@Injectable()
export class SandboxPreviewAuthGuard implements CanActivate {
    constructor(private readonly previewSessionService: SandboxPreviewSessionService) {}

    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest<Request>()
        const conversationId = request.params.conversationId
        const serviceId = request.params.serviceId
        if (!this.previewSessionService.authorizeRequest(request, { conversationId, serviceId })) {
            throw new UnauthorizedException(
                t('server-ai:Error.SandboxPreviewSessionInvalid', {
                    defaultValue: 'Sandbox preview session is invalid.'
                })
            )
        }

        return true
    }
}
