import { forwardRef, Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RouterModule } from 'nest-router'
import { TenantModule } from '@metad/server-core'
import { CopilotRoleController } from './copilot-role.controller'
import { CopilotRole } from './copilot-role.entity'
import { CopilotRoleService } from './copilot-role.service'
import { CommandHandlers } from './commands/handlers/index'
import { KnowledgebaseModule } from '../knowledgebase/'
import { QueryHandlers } from './queries/handlers'

/**
 * @deprecated use Xpert
 */
@Module({
    imports: [
        RouterModule.forRoutes([{ path: '/copilot-role', module: CopilotRoleModule }]),
        TypeOrmModule.forFeature([CopilotRole]),
        TenantModule,
        CqrsModule,
        forwardRef(() => KnowledgebaseModule)
    ],
    controllers: [CopilotRoleController],
    providers: [CopilotRoleService, ...CommandHandlers, ...QueryHandlers],
    exports: [CopilotRoleService]
})
export class CopilotRoleModule { }
