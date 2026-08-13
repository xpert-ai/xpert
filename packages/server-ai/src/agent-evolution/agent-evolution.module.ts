import { EvolutionTargetProviderRegistry } from '@xpert-ai/plugin-sdk'
import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { DiscoveryModule, RouterModule } from '@nestjs/core'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AgentEvolutionService, AgentEvolutionStore } from './application'
import { AgentEvolutionController } from './controllers'
import { AGENT_EVOLUTION_ENTITIES } from './entities'
import { AGENT_EVOLUTION_CONFORMANCE_PROVIDERS } from './providers'
import { AgentEvolutionProviders } from './plugins'

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
        EvolutionTargetProviderRegistry,
        ...AgentEvolutionProviders,
        ...AGENT_EVOLUTION_CONFORMANCE_PROVIDERS
    ],
    exports: [AgentEvolutionService, EvolutionTargetProviderRegistry]
})
export class AgentEvolutionModule {}
