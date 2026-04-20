import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RouterModule } from '@nestjs/core'
import { TenantModule } from '@xpert-ai/server-core'
import { UserModule } from '@xpert-ai/server-core'
import { CopilotController } from './copilot.controller'
import { Copilot } from './copilot.entity'
import { QueryHandlers } from './queries/handlers/index'
import { CopilotService } from './copilot.service'
import { AIModelModule } from '../ai-model'
import { CommandHandlers } from './commands/handlers'
import { CopilotProviderModule } from '../copilot-provider'

@Module({
    imports: [
        RouterModule.register([{ path: '/copilot', module: CopilotModule }]),
        TypeOrmModule.forFeature([Copilot]),
        TenantModule,
        CqrsModule,
        UserModule,
        AIModelModule,
        CopilotProviderModule
    ],
    controllers: [CopilotController],
    providers: [CopilotService, ...QueryHandlers, ...CommandHandlers],
    exports: [CopilotService]
})
export class CopilotModule {}
