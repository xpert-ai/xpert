import { forwardRef, Module } from '@nestjs/common'
import { DiscoveryModule, RouterModule } from '@nestjs/core'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { IntegrationStrategyRegistry } from '@xpert-ai/plugin-sdk'
import { TenantModule } from '../tenant/tenant.module'
import { CommandHandlers } from './commands/handlers'
import { IntegrationController } from './integration.controller'
import { Integration } from './integration.entity'
import { IntegrationService } from './integration.service'
import { QueryHandlers } from './queries/handlers'

@Module({
	imports: [
		RouterModule.register([{ path: '/integration', module: IntegrationModule }]),
		TypeOrmModule.forFeature([Integration]),
		forwardRef(() => TenantModule),
		DiscoveryModule,
		CqrsModule
	],
	controllers: [IntegrationController],
	providers: [IntegrationService, IntegrationStrategyRegistry, ...CommandHandlers, ...QueryHandlers],
	exports: [IntegrationService]
})
export class IntegrationModule {}
