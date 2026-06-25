import { Global, Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CONNECTION_COMMAND_ROUTER_TOKEN, MANAGED_CONNECTION_REGISTRY_TOKEN } from '@xpert-ai/plugin-sdk'
import { RedisModule } from '../core/redis'
import { ConnectionCommandRouterService } from './connection-command-router.service'
import { InstanceRegistryService } from './instance-registry.service'
import { ManagedConnectionCleanupService } from './managed-connection-cleanup.service'
import { ManagedConnectionEntity } from './managed-connection.entity'
import { ManagedConnectionRegistryService } from './managed-connection-registry.service'

@Global()
@Module({
	imports: [TypeOrmModule.forFeature([ManagedConnectionEntity]), RedisModule],
	providers: [
		InstanceRegistryService,
		ManagedConnectionRegistryService,
		ConnectionCommandRouterService,
		ManagedConnectionCleanupService,
		{
			provide: MANAGED_CONNECTION_REGISTRY_TOKEN,
			useExisting: ManagedConnectionRegistryService
		},
		{
			provide: CONNECTION_COMMAND_ROUTER_TOKEN,
			useExisting: ConnectionCommandRouterService
		}
	],
	exports: [
		InstanceRegistryService,
		ManagedConnectionRegistryService,
		ConnectionCommandRouterService,
		MANAGED_CONNECTION_REGISTRY_TOKEN,
		CONNECTION_COMMAND_ROUTER_TOKEN
	]
})
export class ManagedConnectionModule {}
