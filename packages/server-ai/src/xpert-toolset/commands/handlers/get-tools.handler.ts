import type { StructuredToolInterface } from '@langchain/core/tools'
import { RequestContext } from '@xpert-ai/server-core'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { _BaseToolset } from '../../../shared'
import { ToolRuntimeService } from '../../../tool-runtime'
import { ToolsetGetToolsCommand } from '../get-tools.command'

@CommandHandler(ToolsetGetToolsCommand)
export class ToolsetGetToolsHandler implements ICommandHandler<ToolsetGetToolsCommand> {
    constructor(private readonly toolRuntime: ToolRuntimeService) {}

    execute(command: ToolsetGetToolsCommand): Promise<_BaseToolset<StructuredToolInterface>[]> {
        const userId = RequestContext.currentUserId()
        return this.toolRuntime.loadToolsets({
            tenantId: RequestContext.currentTenantId(),
            organizationId: RequestContext.getOrganizationId(),
            workspaceId: command.environment?.workspaceId,
            principal: userId ? { type: 'user', id: userId, userId } : { type: 'service_account', id: 'xpert-runtime' },
            toolsetIds: command.ids,
            ...command.environment
        })
    }
}
