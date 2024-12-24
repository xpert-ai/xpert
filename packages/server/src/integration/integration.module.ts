import { forwardRef, Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RouterModule } from 'nest-router'
import { TenantModule } from '../tenant/tenant.module'
import { IntegrationController } from './integration.controller'
import { Integration } from './integration.entity'
import { IntegrationService } from './integration.service'
import { CommandHandlers } from './commands/handlers'

@Module({
	imports: [
		RouterModule.forRoutes([{ path: '/integration', module: IntegrationModule }]),
		TypeOrmModule.forFeature([Integration]),
		forwardRef(() => TenantModule),
		CqrsModule
	],
	controllers: [IntegrationController],
	providers: [IntegrationService, ...CommandHandlers],
	exports: [IntegrationService]
})
export class IntegrationModule {}
