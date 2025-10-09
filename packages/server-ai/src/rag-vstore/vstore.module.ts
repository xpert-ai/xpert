import { TenantModule } from '@metad/server-core'
import { Module } from '@nestjs/common'
import { DiscoveryModule } from '@nestjs/core'
import { CqrsModule } from '@nestjs/cqrs'
import { VectorStoreRegistry } from '@xpert-ai/plugin-sdk'
import { CommandHandlers } from './commands/handlers'

@Module({
	imports: [TenantModule, CqrsModule, DiscoveryModule],
	controllers: [],
	providers: [VectorStoreRegistry, ...CommandHandlers],
	exports: []
})
export class RagVStoreModule {}
