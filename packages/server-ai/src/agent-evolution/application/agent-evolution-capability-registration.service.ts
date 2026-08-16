import {
    EvolutionRuntimeCapability,
    type RuntimeCapabilityRegistry,
    XPERT_RUNTIME_CAPABILITIES_TOKEN
} from '@xpert-ai/plugin-sdk'
import { Inject, Injectable, OnModuleInit, Optional } from '@nestjs/common'
import { AgentEvolutionRuntimeService } from './agent-evolution-runtime.service'

@Injectable()
export class AgentEvolutionCapabilityRegistrationService implements OnModuleInit {
    constructor(
        @Optional()
        @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN)
        private readonly capabilities: RuntimeCapabilityRegistry | undefined,
        private readonly runtime: AgentEvolutionRuntimeService
    ) {}

    onModuleInit() {
        this.capabilities?.register(EvolutionRuntimeCapability, this.runtime)
    }
}
