import { TenantModule } from '@xpert-ai/server-core'
import { Module } from '@nestjs/common'
import { DiscoveryModule } from '@nestjs/core'
import { CqrsModule } from '@nestjs/cqrs'
import { VectorStoreRegistry } from '@xpert-ai/plugin-sdk'
import { VectorStoreSettingsService } from './vector-store-settings.service'
import { CommandHandlers } from './commands/handlers'

@Module({
    imports: [TenantModule, CqrsModule, DiscoveryModule],
    controllers: [],
    providers: [VectorStoreSettingsService, VectorStoreRegistry, ...CommandHandlers],
    exports: [VectorStoreSettingsService]
})
export class RagVStoreModule {}
