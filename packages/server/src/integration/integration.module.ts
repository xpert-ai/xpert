import { forwardRef, Module } from '@nestjs/common'
import { DiscoveryModule, RouterModule } from '@nestjs/core'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { IntegrationStrategyRegistry } from '@xpert-ai/plugin-sdk'
import { TenantModule } from '../tenant/tenant.module'
import { UserModule } from '../user'
import { CommandHandlers } from './commands/handlers'
import { IntegrationController } from './integration.controller'
import { Integration } from './integration.entity'
import { IntegrationService } from './integration.service'
import { QueryHandlers } from './queries/handlers'
import { RedisModule } from '../core/redis/redis.module'
import { IntegrationQrController } from './integration-qr.controller'
import { IntegrationQrService } from './integration-qr.service'

@Module({
	imports: [
		RedisModule,
		RouterModule.register([{ path: '/integration', module: IntegrationModule }]),
		TypeOrmModule.forFeature([Integration]),
		forwardRef(() => TenantModule),
		UserModule,
		DiscoveryModule,
		CqrsModule
	],
	controllers: [IntegrationController, IntegrationQrController],
	providers: [IntegrationService, IntegrationQrService, IntegrationStrategyRegistry, ...CommandHandlers, ...QueryHandlers],
	exports: [IntegrationService, IntegrationQrService]
})
export class IntegrationModule {}
