import { EvolutionStrategyService } from './changes/strategy.service'
import { EvolutionEvaluationExecutor } from './changes/evaluation-executor.service'
import { EvolutionPublicationExecutor } from './changes/publication-executor.service'
import { EvolutionLifecycleController } from './changes/lifecycle.controller'
import { EvolutionLifecycleService } from './changes/lifecycle.service'
import { EvolutionChangeService } from './changes/change.service'
import { EvolutionChangeStore } from './changes/change.store'
import { EvolutionChangeProcessor } from './changes/change.processor'
import { EVOLUTION_RUNTIME_SERVICE_TOKEN, EvolutionTargetProviderRegistry } from '@xpert-ai/plugin-sdk'
import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { DiscoveryModule, RouterModule } from '@nestjs/core'
import { TypeOrmModule } from '@nestjs/typeorm'
import {
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
    controllers: [EvolutionLifecycleController, AgentEvolutionController],
    providers: [
        EvolutionChangeService,
        EvolutionStrategyService,
        EvolutionEvaluationExecutor,
        EvolutionPublicationExecutor,
        EvolutionChangeStore,
        EvolutionLifecycleService,
        EvolutionChangeProcessor,
        AgentEvolutionStore,
        AgentEvolutionService,
        AgentEvolutionRuntimeService,
        AgentEvolutionGovernanceService,
        AgentEvolutionAnalystService,
        AgentEvolutionQualityGovernanceService,
        AgentEvolutionReleaseGatePolicyService,
        AgentEvolutionQueueService,
        AgentEvolutionQueueProcessor,
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
