import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { IApiPrincipal, SecretTokenBindingType } from '@xpert-ai/contracts'
import { GroupAccessService } from '../../chat-group/group-access.service'
import { groupDenied } from '../../chat-group/group.errors'

/** Shared ChatKit auth runs first. This guard restricts conversation grants to one group route. */
@Injectable()
export class GroupScopeGuard implements CanActivate {
    constructor(private readonly access: GroupAccessService) {}
    async canActivate(context: ExecutionContext) {
        const request = context.switchToHttp().getRequest<{ params: { groupId?: string }; user?: IApiPrincipal }>()
        if (request.user?.principalType !== 'client_secret' && request.user?.principalType !== 'api_key') return true
        const groupId = request.params.groupId
        if (request.user.clientSecretBindingType !== SecretTokenBindingType.USER_CONVERSATION || !groupId)
            throw groupDenied()
        await this.access.authorize(groupId)
        return true
    }
}
