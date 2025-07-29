import { TenantModule } from '@metad/server-core'
import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { CommandHandlers } from './commands/handlers'

@Module({
    imports: [
        TenantModule,
        CqrsModule,
    ],
    controllers: [],
    providers: [...CommandHandlers],
    exports: []
})
export class RagVStoreModule {}
