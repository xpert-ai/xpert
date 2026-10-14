import { TenantModule, UserModule } from '@xpert-ai/server-core'
import { Module, forwardRef } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RouterModule } from '@nestjs/core'
import { CopilotProviderController } from './copilot-provider.controller'
import { CopilotProvider } from './copilot-provider.entity'
import { CopilotProviderService } from './copilot-provider.service'
import { CopilotProviderModel } from '../core'
import { CopilotProviderModelService } from './models/copilot-provider-model.service'
import { CommandHandlers } from './commands/handlers'
import { QueryHandlers } from './queries/handlers'
import { AIModelModule } from '../ai-model'
import { ModelAccessModule } from '../model-access'
import { ModelDiscoveryController } from './model-discovery/model-discovery.controller'
import { ModelDiscoveryService } from './model-discovery/model-discovery.service'

@Module({
    imports: [
        RouterModule.register([{ path: '/copilot-provider', module: CopilotProviderModule }]),
        TypeOrmModule.forFeature([CopilotProvider, CopilotProviderModel]),
        forwardRef(() => UserModule),
        TenantModule,
        CqrsModule,

        AIModelModule,
        ModelAccessModule
    ],
    controllers: [ModelDiscoveryController, CopilotProviderController],
    providers: [
        CopilotProviderService,
        CopilotProviderModelService,
        ModelDiscoveryService,
        ...CommandHandlers,
        ...QueryHandlers
    ],
    exports: [CopilotProviderService]
})
export class CopilotProviderModule {}
