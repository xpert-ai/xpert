import { forwardRef, Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RouterModule } from '@nestjs/core'
import { TenantModule } from '../tenant/tenant.module'
import { IntegrationController } from './integration.controller'
import { Integration } from './integration.entity'
import { IntegrationService } from './integration.service'
import { CommandHandlers } from './commands/handlers'
import { QueryHandlers } from './queries/handlers'

@Module({
	imports: [
		RouterModule.register([{ path: '/integration', module: IntegrationModule }]),
		TypeOrmModule.forFeature([Integration]),
		forwardRef(() => TenantModule),
		CqrsModule
	],
	controllers: [IntegrationController],
	providers: [IntegrationService, ...CommandHandlers, ...QueryHandlers],
	exports: [IntegrationService]
})
export class IntegrationModule {}
