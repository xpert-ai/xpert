import { Global, Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { XPERT_RUNTIME_CAPABILITIES_TOKEN } from '@xpert-ai/plugin-sdk'
import { AgentMiddlewareRuntimeService } from './middleware-runtime.service'
import { VolumeModule } from '../volume'
import { WorkspaceFilesRuntimeCapabilityService } from '../runtime/workspace-files-runtime-capability.service'
import { ConnectorModule } from '../../connector/connector.module'
import { ArtifactsModule } from '../../artifacts'

@Global()
@Module({
    imports: [CqrsModule, VolumeModule, ConnectorModule, ArtifactsModule],
    providers: [
        WorkspaceFilesRuntimeCapabilityService,
        AgentMiddlewareRuntimeService,
        {
            provide: XPERT_RUNTIME_CAPABILITIES_TOKEN,
            useFactory: (runtimeService: AgentMiddlewareRuntimeService) => runtimeService.api.capabilities,
            inject: [AgentMiddlewareRuntimeService]
        }
    ],
    exports: [
        ConnectorModule,
        ArtifactsModule,
        AgentMiddlewareRuntimeService,
        WorkspaceFilesRuntimeCapabilityService,
        XPERT_RUNTIME_CAPABILITIES_TOKEN
    ]
})
export class AgentMiddlewareRuntimeModule {}
