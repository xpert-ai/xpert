import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { AssistantExecutionPolicyService } from './assistant-execution-policy.service'
import { ResolveManagedRuntimeActorCommand } from '../agent-invocation/managed/resolve-managed-runtime-actor.command'
import { invocationError } from '../agent-invocation/invocation-runtime'

@CommandHandler(ResolveManagedRuntimeActorCommand)
export class ResolveManagedRuntimeActorHandler implements ICommandHandler<ResolveManagedRuntimeActorCommand> {
    constructor(private readonly assistants: AssistantExecutionPolicyService) {}
    async execute({ scope }: ResolveManagedRuntimeActorCommand) {
        if (!scope.conversationId || scope.callerType === 'project_pipeline') throw invocationError('InvalidScope')
        const selection = await this.assistants.resolve(scope, scope.conversationId)
        if (
            selection.assistant.workspaceId !== scope.workspaceId ||
            (scope.callerType === 'project_agent'
                ? !scope.projectId || selection.conversation.projectId !== scope.projectId
                : selection.assistant.id !== scope.callerXpertId)
        )
            throw invocationError('InvalidScope')
        return { modelSourceId: selection.assistant.id }
    }
}
