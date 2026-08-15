import { EVOLUTION_RUNTIME_SERVICE_TOKEN, EvolutionTargetProviderRegistry } from '@xpert-ai/plugin-sdk'
import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { DiscoveryModule, RouterModule } from '@nestjs/core'
import { TypeOrmModule } from '@nestjs/typeorm'
import {
    AgentEvolutionCapabilityRegistrationService,
    AgentEvolutionRuntimeService,
    AgentEvolutionGovernanceService,
    AgentEvolutionQueueProcessor,
    AgentEvolutionQueueService,
    AgentEvolutionService,
    AgentEvolutionAnalystService,
    AgentEvolutionQualityGovernanceService,
    AgentEvolutionReleaseGatePolicyService,
    AgentEvolutionStore
} from './application'
import { AgentEvolutionController } from './controllers'
import { AGENT_EVOLUTION_ENTITIES } from './entities'
import { AGENT_EVOLUTION_CONFORMANCE_PROVIDERS } from './providers'

@Module({
    imports: [
        RouterModule.register([{ path: '/agent-evolution', module: AgentEvolutionModule }]),
        TypeOrmModule.forFeature(AGENT_EVOLUTION_ENTITIES),
        CqrsModule,
        DiscoveryModule
    ],
    controllers: [AgentEvolutionController],
    providers: [
        AgentEvolutionStore,
        AgentEvolutionService,
        AgentEvolutionRuntimeService,
        AgentEvolutionGovernanceService,
        AgentEvolutionAnalystService,
        AgentEvolutionQualityGovernanceService,
        AgentEvolutionReleaseGatePolicyService,
        AgentEvolutionQueueService,
        AgentEvolutionQueueProcessor,
        AgentEvolutionCapabilityRegistrationService,
        EvolutionTargetProviderRegistry,
        { provide: EVOLUTION_RUNTIME_SERVICE_TOKEN, useExisting: AgentEvolutionRuntimeService },
        ...AGENT_EVOLUTION_CONFORMANCE_PROVIDERS
    ],
    exports: [
        AgentEvolutionService,
        AgentEvolutionRuntimeService,
        EVOLUTION_RUNTIME_SERVICE_TOKEN,
        EvolutionTargetProviderRegistry
    ]
})
export class AgentEvolutionModule {}
