import { Global, Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { XPERT_RUNTIME_CAPABILITIES_TOKEN } from '@xpert-ai/plugin-sdk'
import { AgentMiddlewareRuntimeService } from './middleware-runtime.service'

@Global()
@Module({
    imports: [CqrsModule],
    providers: [
        AgentMiddlewareRuntimeService,
        {
            provide: XPERT_RUNTIME_CAPABILITIES_TOKEN,
            useFactory: (runtimeService: AgentMiddlewareRuntimeService) => runtimeService.api.capabilities,
            inject: [AgentMiddlewareRuntimeService]
        }
    ],
    exports: [AgentMiddlewareRuntimeService, XPERT_RUNTIME_CAPABILITIES_TOKEN]
})
export class AgentMiddlewareRuntimeModule {}
