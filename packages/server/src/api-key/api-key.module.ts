import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RouterModule } from '@nestjs/core'
import { IntegrationModule } from '../integration'
import { TenantModule } from '../tenant/tenant.module'
import { UserModule } from '../user'
import { ApiKeyController } from './api-key.controller'
import { ApiKey } from './api-key.entity'
import { ApiKeyService } from './api-key.service'
import { QueryHandlers } from './queries/handlers'
import { ApiKeyStrategy } from './api-key.strategy'

@Module({
	imports: [
		RouterModule.register([{ path: '/api-key', module: ApiKeyModule }]),
		TypeOrmModule.forFeature([ApiKey]),
		CqrsModule,
		TenantModule,
		UserModule,
		IntegrationModule
	],
	controllers: [ApiKeyController],
	providers: [ApiKeyService, ApiKeyStrategy, ...QueryHandlers],
	exports: [ApiKeyService]
})
export class ApiKeyModule {}
