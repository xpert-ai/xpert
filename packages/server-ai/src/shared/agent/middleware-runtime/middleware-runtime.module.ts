import { forwardRef, Global, Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN, type AgentMiddlewareRuntimeServiceApi } from '@xpert-ai/plugin-sdk'
import { ActorTokenRuntimeModule } from '../../../actor-token/actor-token-runtime.module'
import { AgentMiddlewareRuntimeService } from './middleware-runtime.service'
import { FileRuntimeModule } from '../../../file-understanding/runtime/file-runtime.module'
import { AgentMiddlewareModelRuntimeService } from './model-runtime.service'
import { WorkspaceFilesRuntimeModule } from '../../runtime/workspace-files-runtime.module'
import { ConnectorModule } from '../../../connector/connector.module'
import { ArtifactsModule } from '../../../artifacts/artifacts.module'
import { CollaborationModule } from '../../../collaboration/collaboration.module'
import { CopilotModule } from '../../../copilot/copilot.module'
import { CopilotUsageModule } from '../../../copilot-usage'
import { RuntimeCapabilityModule } from '../../runtime'
import { AgentEvolutionModule } from '../../../agent-evolution/agent-evolution.module'
import { ExecutionObservationModule } from '../../../xpert-agent-execution/observability/observation.module'
import { ConversationRuntimeModule } from '../../../chat-conversation/conversation-runtime.module'

@Global()
@Module({
    imports: [
        CqrsModule,
        ConversationRuntimeModule,
        RuntimeCapabilityModule,
        ExecutionObservationModule,
        AgentEvolutionModule,
        WorkspaceFilesRuntimeModule,
        FileRuntimeModule,
        ConnectorModule,
        ArtifactsModule,
        CollaborationModule,
        forwardRef(() => CopilotModule),
        CopilotUsageModule,
        ActorTokenRuntimeModule
    ],
    providers: [
        AgentMiddlewareModelRuntimeService,
        AgentMiddlewareRuntimeService,
        {
            provide: XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN,
            // Plugins supply ordinary invocation scope. Only the View host can supply authorized View access.
            inject: [AgentMiddlewareRuntimeService],
            useFactory: (runtime: AgentMiddlewareRuntimeService): AgentMiddlewareRuntimeServiceApi => ({
                createScopedApi: (scope) => runtime.createScopedApi(scope)
            })
        }
    ],
    exports: [
        ConnectorModule,
        ArtifactsModule,
        CollaborationModule,
        AgentMiddlewareRuntimeService,
        XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN,
        RuntimeCapabilityModule
    ]
})
export class AgentMiddlewareRuntimeModule {}
