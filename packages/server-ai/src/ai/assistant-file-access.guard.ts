import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
    SetMetadata,
    UnauthorizedException
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ApiKeyBindingType, IApiPrincipal, IUser, SecretTokenBindingType } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { WorkspaceFileAccessService } from '../workspace-file-access/workspace-file-access.service'

type FileAccessPolicy = 'workspace' | 'view-session-create' | 'view-session'
const FILE_ACCESS_POLICY = 'ai:file-access-policy'
export const AssistantFileAccess = (policy: FileAccessPolicy) => SetMetadata(FILE_ACCESS_POLICY, policy)

/**
 * Invariants: authenticate first; resolve delegated scope from an explicit route
 * policy. Session IDs resolve to stored, owner-checked hosts, never caller overrides.
 * File/View services retain resource authorization for every entry point.
 */
@Injectable()
export class AssistantFileAccessGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly files: WorkspaceFileAccessService
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<{
            user?: IUser | IApiPrincipal
            params: { assistantId?: string; sessionId?: string }
            body?: unknown
        }>()
        const user = request.user
        if (!user?.id) throw new UnauthorizedException()
        const policy = this.reflector.getAllAndOverride<FileAccessPolicy>(FILE_ACCESS_POLICY, [
            context.getHandler(),
            context.getClass()
        ])
        const denied = () =>
            new ForbiddenException(
                t('server-ai:Error.WorkspaceFileAccessDenied', { defaultValue: 'Workspace file access was denied.' })
            )
        if (!policy) throw denied()
        // Login users have no credential-bound Assistant. The domain services
        // still verify workspace membership and file-session ownership.
        if (!('principalType' in user)) return true
        const allowedBindings =
            policy === 'workspace'
                ? [SecretTokenBindingType.USER_XPERT]
                : [SecretTokenBindingType.USER_XPERT, SecretTokenBindingType.ENTERPRISE_XPERT]
        if (
            user.principalType !== 'client_secret' ||
            !user.apiKey ||
            user.apiKey.type !== ApiKeyBindingType.ASSISTANT ||
            !user.apiKey.entityId ||
            !user.tenantId ||
            user.apiKey.tenantId !== user.tenantId ||
            !allowedBindings.includes(user.clientSecretBindingType) ||
            (user.apiKey.organizationId ?? null) !== (RequestContext.getOrganizationId() ?? null)
        )
            throw denied()

        let host: { hostType: string; hostId: string }
        if (policy === 'workspace') {
            host = { hostType: 'agent', hostId: request.params.assistantId ?? '' }
        } else if (policy === 'view-session') {
            host = await this.files.getAuthenticatedSessionHost(request.params.sessionId ?? '')
        } else {
            const body = request.body
            if (
                !body ||
                typeof body !== 'object' ||
                !('hostType' in body) ||
                typeof body.hostType !== 'string' ||
                !('hostId' in body) ||
                typeof body.hostId !== 'string'
            )
                throw denied()
            host = { hostType: body.hostType, hostId: body.hostId }
        }
        if (host.hostType !== 'agent' || host.hostId !== user.apiKey.entityId) throw denied()
        return true
    }
}
