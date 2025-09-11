import { forwardRef, Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DiscoveryModule, RouterModule } from '@nestjs/core'
import { TenantModule } from '../tenant/tenant.module'
import { IntegrationController } from './integration.controller'
import { Integration } from './integration.entity'
import { IntegrationService } from './integration.service'
import { CommandHandlers } from './commands/handlers'
import { QueryHandlers } from './queries/handlers'
import { IntegrationStrategyRegistry } from '@xpert-ai/plugin-sdk'

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
