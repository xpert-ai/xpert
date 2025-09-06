import { Module, forwardRef } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RouterModule } from '@nestjs/core'
import { TenantModule, UserModule } from '@metad/server-core'
import { CopilotUser } from './copilot-user.entity'
import { CopilotUserService } from './copilot-user.service'
import { CopilotUserController } from './copilot-user.controller'
import { CommandHandlers } from './commands/handlers'
import { CopilotOrganizationModule } from '../copilot-organization/index'

@Module({
    imports: [
        RouterModule.register([{ path: '/copilot-user', module: CopilotUserModule }]),
        TypeOrmModule.forFeature([CopilotUser]),
		forwardRef(() => UserModule),
        TenantModule,
        CqrsModule,
        CopilotOrganizationModule
    ],
    controllers: [CopilotUserController],
    providers: [CopilotUserService, ...CommandHandlers],
    exports: [CopilotUserService]
})
export class CopilotUserModule { }
