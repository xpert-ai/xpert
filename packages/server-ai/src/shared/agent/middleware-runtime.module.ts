import { forwardRef, Global, Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN, XPERT_RUNTIME_CAPABILITIES_TOKEN } from '@xpert-ai/plugin-sdk'
import { ActorTokenModule } from '@xpert-ai/server-core'
import { AgentMiddlewareRuntimeService } from './middleware-runtime.service'
import { VolumeModule } from '../volume'
import { WorkspaceFilesRuntimeCapabilityService } from '../runtime/workspace-files-runtime-capability.service'
import { ConnectorModule } from '../../connector/connector.module'
import { ArtifactsModule } from '../../artifacts/artifacts.module'
import { CollaborationModule } from '../../collaboration/collaboration.module'
import { CopilotModule } from '../../copilot/copilot.module'
import { CopilotUsageModule } from '../../copilot-usage'
import { XpertProjectAccessModule } from '../../xpert-project/project-access.module'

@Global()
@Module({
    imports: [
        CqrsModule,
        VolumeModule,
        ConnectorModule,
        ArtifactsModule,
        CollaborationModule,
        forwardRef(() => CopilotModule),
        CopilotUsageModule,
        ActorTokenModule,
        XpertProjectAccessModule
    ],
    providers: [
        WorkspaceFilesRuntimeCapabilityService,
        AgentMiddlewareRuntimeService,
        {
            provide: XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN,
            useExisting: AgentMiddlewareRuntimeService
        },
        {
            provide: XPERT_RUNTIME_CAPABILITIES_TOKEN,
            useFactory: (runtimeService: AgentMiddlewareRuntimeService) => runtimeService.api.capabilities,
            inject: [AgentMiddlewareRuntimeService]
        }
    ],
    exports: [
        ConnectorModule,
        ArtifactsModule,
        CollaborationModule,
        AgentMiddlewareRuntimeService,
        WorkspaceFilesRuntimeCapabilityService,
        XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN,
        XPERT_RUNTIME_CAPABILITIES_TOKEN
    ]
})
export class AgentMiddlewareRuntimeModule {}
