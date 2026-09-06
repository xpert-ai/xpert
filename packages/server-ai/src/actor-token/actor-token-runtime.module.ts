import { Module } from '@nestjs/common'
import { ActorTokenModule } from '@xpert-ai/server-core'
import { RuntimeCapabilityModule } from '../shared/runtime/runtime-capability.module'
import { ActorTokenRuntimeService } from './actor-token-runtime.service'

@Module({
    imports: [ActorTokenModule, RuntimeCapabilityModule],
    providers: [ActorTokenRuntimeService],
    exports: [ActorTokenRuntimeService]
})
export class ActorTokenRuntimeModule {}
