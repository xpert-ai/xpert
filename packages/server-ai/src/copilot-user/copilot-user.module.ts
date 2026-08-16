import { Module, forwardRef } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RouterModule } from '@nestjs/core'
import { TenantModule, UserModule } from '@xpert-ai/server-core'
import { CopilotUser } from './copilot-user.entity'
import { CopilotUserService } from './copilot-user.service'
import { CopilotUserController } from './copilot-user.controller'
import { CommandHandlers } from './commands/handlers'
import { QueryHandlers } from './queries/handlers'
import { CopilotOrganizationModule } from '../copilot-organization/index'
import { ModelAccessModule } from '../model-access'
import { CopilotUsageModule } from '../copilot-usage'

@Module({
    imports: [
        RouterModule.register([{ path: '/copilot-user', module: CopilotUserModule }]),
        TypeOrmModule.forFeature([CopilotUser]),
        forwardRef(() => UserModule),
        TenantModule,
        CqrsModule,
        CopilotOrganizationModule,
        ModelAccessModule,
        CopilotUsageModule
    ],
    controllers: [CopilotUserController],
    providers: [CopilotUserService, ...CommandHandlers, ...QueryHandlers],
    exports: [CopilotUserService]
})
export class CopilotUserModule {}
