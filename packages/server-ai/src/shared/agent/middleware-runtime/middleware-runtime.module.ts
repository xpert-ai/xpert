import { forwardRef, Global, Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN } from '@xpert-ai/plugin-sdk'
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

@Global()
@Module({
    imports: [
        CqrsModule,
        RuntimeCapabilityModule,
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
            useExisting: AgentMiddlewareRuntimeService
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
