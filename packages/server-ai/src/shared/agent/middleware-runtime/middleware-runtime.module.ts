import { forwardRef, Global, Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN } from '@xpert-ai/plugin-sdk'
import { ActorTokenModule } from '@xpert-ai/server-core'
import { AgentMiddlewareRuntimeService } from './middleware-runtime.service'
import { AgentMiddlewareAssistantTaskRuntimeService } from './assistant-task-runtime.service'
import { AgentMiddlewareFileRuntimeService } from './file-runtime.service'
import { AgentMiddlewareKnowledgeRuntimeService } from './knowledge-runtime.service'
import { AgentMiddlewareModelRuntimeService } from './model-runtime.service'
import { VolumeModule } from '../../volume'
import { WorkspaceFilesRuntimeCapabilityService } from '../../runtime/workspace-files-runtime-capability.service'
import { ConnectorModule } from '../../../connector/connector.module'
import { ArtifactsModule } from '../../../artifacts/artifacts.module'
import { CollaborationModule } from '../../../collaboration/collaboration.module'
import { CopilotModule } from '../../../copilot/copilot.module'
import { CopilotUsageModule } from '../../../copilot-usage'
import { RuntimeCapabilityModule } from '../../runtime'

@Global()
@Module({
    imports: [
        CqrsModule,
        RuntimeCapabilityModule,
        VolumeModule,
        ConnectorModule,
        ArtifactsModule,
        CollaborationModule,
        forwardRef(() => CopilotModule),
        CopilotUsageModule,
        ActorTokenModule
    ],
    providers: [
        WorkspaceFilesRuntimeCapabilityService,
        AgentMiddlewareModelRuntimeService,
        AgentMiddlewareKnowledgeRuntimeService,
        AgentMiddlewareFileRuntimeService,
        AgentMiddlewareAssistantTaskRuntimeService,
        AgentMiddlewareRuntimeService,
        {
            provide: XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN,
            useExisting: AgentMiddlewareRuntimeService
        }
    ],
    exports: [
        ConnectorModule,
        ArtifactsModule,
        CollaborationModule,
        AgentMiddlewareRuntimeService,
        WorkspaceFilesRuntimeCapabilityService,
        XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN,
        RuntimeCapabilityModule
    ]
})
export class AgentMiddlewareRuntimeModule {}
