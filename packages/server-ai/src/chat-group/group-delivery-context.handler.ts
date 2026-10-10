import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { RequestScopeLevel } from '@xpert-ai/contracts'
import { captureRequestContext } from '../shared/request-context'
import { GroupAccessService } from './group-access.service'
import { ResolveGroupDeliveryContextCommand } from './group-dispatch.commands'

/** Keep group authorization in its owning module; the common chat processor consumes a validated context. */
@CommandHandler(ResolveGroupDeliveryContextCommand)
export class ResolveGroupDeliveryContextHandler implements ICommandHandler<ResolveGroupDeliveryContextCommand> {
    constructor(private readonly access: GroupAccessService) {}

    execute(command: ResolveGroupDeliveryContextCommand) {
        return this.access.withDeliveryActor(command.recipientId, command.tenantId, command.conversationId, async () =>
            captureRequestContext({
                tenantId: RequestContext.currentTenantId(),
                organizationId: RequestContext.getOrganizationId(),
                headers: { 'x-scope-level': RequestScopeLevel.ORGANIZATION }
            })
        )
    }
}
