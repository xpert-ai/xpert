import { forwardRef, Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DiscoveryModule, RouterModule } from '@nestjs/core'
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
import { EnvironmentModule } from '../environment'
import { WorkflowTriggerRegistry } from '@xpert-ai/plugin-sdk'

@Module({
    imports: [
        RouterModule.register([{ path: '/xpert', module: XpertModule }]),
        TypeOrmModule.forFeature([Xpert]),
        DiscoveryModule,
        TenantModule,
        CqrsModule,
        forwardRef(() => KnowledgebaseModule),
        forwardRef(() => XpertAgentModule),
        forwardRef(() => UserModule),
        forwardRef(() => XpertWorkspaceModule),
        forwardRef(() => EnvironmentModule),
        CopilotCheckpointModule,
        CopilotStoreModule,
    ],
    controllers: [XpertController],
    providers: [XpertService, AnonymousStrategy, WorkflowTriggerRegistry, ...CommandHandlers, ...QueryHandlers],
    exports: [XpertService]
})
export class XpertModule { }
