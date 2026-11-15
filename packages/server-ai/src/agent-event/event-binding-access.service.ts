import { ForbiddenException, Injectable } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { AssertProjectAssistantAccessCommand } from '../xpert-project/commands/assert-project-assistant-access.command'
import { PublishedXpertAccessService } from '../xpert/published-xpert-access.service'
import { XpertWorkspaceAccessService } from '../xpert-workspace/workspace-access.service'
import { AgentEventBinding } from './agent-event.entity'

@Injectable()
export class EventBindingAccessService {
    constructor(
        private readonly published: PublishedXpertAccessService,
        private readonly workspaces: XpertWorkspaceAccessService,
        private readonly commands: CommandBus
    ) {}

    async assertAccessible(binding: AgentEventBinding) {
        const target = await this.published.getAccessiblePublishedXpert(binding.xpertId)
        if (target.workspaceId !== binding.workspaceId || target.organizationId !== binding.organizationId)
            throw new ForbiddenException()
        if (binding.projectId)
            await this.commands.execute(new AssertProjectAssistantAccessCommand(binding.projectId, binding.xpertId))
        await this.workspaces.assertCanAuthor(binding.workspaceId)
        return target.title || target.name
    }
}
