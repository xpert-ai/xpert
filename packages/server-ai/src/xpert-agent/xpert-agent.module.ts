import { RedisModule, TenantModule } from '@xpert-ai/server-core'
import { forwardRef, Module } from '@nestjs/common'
import { DiscoveryModule, RouterModule } from '@nestjs/core'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AgentMiddlewareRegistry, WorkflowNodeRegistry, WorkflowTriggerRegistry } from '@xpert-ai/plugin-sdk'
import { CopilotCheckpointModule } from '../copilot-checkpoint'
import { ChatMessage } from '../chat-message/chat-message.entity'
import { EnvironmentModule } from '../environment'
import { ConversationTitleService } from '../shared/agent/conversation-title.service'
import { AgentMiddlewareRuntimeService } from '../shared/agent/middleware-runtime.service'
import { ExecutionCancelModule } from '../shared/execution/execution-cancel.module'
import { XpertAgentExecutionModule } from '../xpert-agent-execution'
import { XpertModule } from '../xpert/xpert.module'
import { CommandHandlers } from './commands/handlers'
import { QueryHandlers } from './queries/handlers'
import { XpertTitleMiddlewareService } from './title/xpert-title.middleware'
import { Validators } from './workflow'
import { WorkflowCommandHandlers } from './workflow/handlers'
import { XpertAgentController } from './xpert-agent.controller'
import { XpertAgent } from './xpert-agent.entity'
import { XpertAgentService } from './xpert-agent.service'
import { Strategies, Validators as PluginValidators } from './plugins'
import { SkillPackageModule } from '../skill-package'

@Module({
    imports: [
        RouterModule.register([{ path: '/xpert-agent', module: XpertAgentModule }]),
        TypeOrmModule.forFeature([XpertAgent, ChatMessage]),
        TenantModule,
        RedisModule,
        CqrsModule,
        DiscoveryModule,

        CopilotCheckpointModule,
        XpertAgentExecutionModule,
        forwardRef(() => XpertModule),
        forwardRef(() => EnvironmentModule),
        ExecutionCancelModule,
        SkillPackageModule
    ],
    controllers: [XpertAgentController],
    providers: [
        XpertAgentService,
        AgentMiddlewareRuntimeService,
        ConversationTitleService,
        XpertTitleMiddlewareService,
        WorkflowTriggerRegistry,
        WorkflowNodeRegistry,
        AgentMiddlewareRegistry,
        ...CommandHandlers,
        ...WorkflowCommandHandlers,
        ...QueryHandlers,
        ...Validators,
        ...PluginValidators,
        ...Strategies
    ],
    exports: [XpertAgentService, AgentMiddlewareRegistry]
})
export class XpertAgentModule {}
