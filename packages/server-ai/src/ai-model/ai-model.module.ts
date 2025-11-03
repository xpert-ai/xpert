import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { DiscoveryModule, RouterModule } from '@nestjs/core'
import { AIModelProviderRegistry } from '@xpert-ai/plugin-sdk'
import { AIModelController } from './ai-model.controller'
import { AIProvidersService } from './ai-model.service'
import { CommandHandlers } from './commands/handlers'
import { ProviderModules } from './model_providers'
import { QueryHandlers } from './queries/handlers'

@Module({
	imports: [
		RouterModule.register([{ path: '/ai-model', module: AIModelModule }]),
		DiscoveryModule,
		CqrsModule,
		...ProviderModules
	],
	controllers: [AIModelController],
	providers: [AIProvidersService, AIModelProviderRegistry, ...QueryHandlers, ...CommandHandlers],
	exports: [AIProvidersService]
})
export class AIModelModule {}
