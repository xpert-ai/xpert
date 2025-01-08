import { forwardRef, Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RouterModule } from 'nest-router'
import { TenantModule, UserModule } from '@metad/server-core'
import { XpertController } from './xpert.controller'
import { Xpert } from './xpert.entity'
import { XpertService } from './xpert.service'
import { CommandHandlers } from './commands/handlers/index'
import { KnowledgebaseModule } from '../knowledgebase'
import { QueryHandlers } from './queries/handlers'
import { XpertAgentModule } from '../xpert-agent'
import { XpertWorkspaceModule } from '../xpert-workspace'
import { CopilotCheckpointModule } from '../copilot-checkpoint'
import { CopilotStoreModule } from '../copilot-store/copilot-store.module'
import { AnonymousStrategy } from './auth/anonymous.strategy'

@Module({
    imports: [
        RouterModule.forRoutes([{ path: '/xpert', module: XpertModule }]),
        TypeOrmModule.forFeature([Xpert]),
        TenantModule,
        CqrsModule,
        forwardRef(() => KnowledgebaseModule),
        forwardRef(() => XpertAgentModule),
        forwardRef(() => UserModule),
        forwardRef(() => XpertWorkspaceModule),
        CopilotCheckpointModule,
        CopilotStoreModule,
    ],
    controllers: [XpertController],
    providers: [XpertService, AnonymousStrategy, ...CommandHandlers, ...QueryHandlers],
    exports: [XpertService]
})
export class XpertModule { }
