import { RedisModule, SecretTokenModule, StorageFileModule, TenantModule } from '@xpert-ai/server-core'
import { forwardRef, Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { RouterModule } from '@nestjs/core'
import { CopilotModule } from '../copilot'
import { CopilotOrganizationModule } from '../copilot-organization/index'
import { CopilotUserModule } from '../copilot-user/index'
import { KnowledgebaseModule } from '../knowledgebase'
import { AIV1Controller } from './ai-v1.controller'
import { AIController } from './ai.controller'
import { AiService } from './ai.service'
import { CommandHandlers } from './commands/handlers'
import { QueryHandlers } from './queries/handlers'
import { ThreadsController } from './thread.controller'
import { KnowledgeDocumentModule } from '../knowledge-document'
import { AssistantsController } from './assistant.controller'
import { XpertModule } from '../xpert'
import { StoreController } from './store.controller'
import { ContextsController } from './context.controller'
import { KnowledgesController } from './knowledge.controller'
import { ConversationsController } from './conversation.controller'
import { ChatConversationModule } from '../chat-conversation'
import { ChatMessageModule } from '../chat-message'
import { ChatMessageFeedbackModule } from '../chat-message-feedback'
import { EnvironmentModule } from '../environment'
import { AssistantBindingModule } from '../assistant-binding'
import { XpertAgentModule } from '../xpert-agent'
import { SkillPackageModule } from '../skill-package'
import { RuntimeCommandService } from './runtime-command.service'
import { PromptWorkflowModule } from '../prompt-workflow'
import { RuntimeCapabilitiesService } from './runtime-capabilities.service'
import { SseStreamModule } from '../shared/stream'
import { XpertProjectModule } from '../xpert-project'
import { FileUnderstandingModule } from '../file-understanding'
import { XpertAgentExecutionModule } from '../xpert-agent-execution/agent-execution.module'
import { ConversationAgentRunsService } from './conversation-agent-runs.service'

import { RuntimeResourceController } from '../agent-plugin/runtime-resource.controller'
import { ConnectorModule } from '../connector/connector.module'
import { ConnectorRuntimeController } from './connector-runtime.controller'

@Module({
    imports: [
        RouterModule.register([
            {
                path: '/ai',
                module: AIModule
            }
        ]),
        TenantModule,
        SecretTokenModule,
        RedisModule,
        CqrsModule,
        ConnectorModule,
        CopilotModule,
        CopilotUserModule,
        CopilotOrganizationModule,
        forwardRef(() => KnowledgebaseModule),
        forwardRef(() => KnowledgeDocumentModule),
        forwardRef(() => StorageFileModule),
        forwardRef(() => XpertModule),
        forwardRef(() => XpertAgentModule),
        forwardRef(() => SkillPackageModule),
        forwardRef(() => PromptWorkflowModule),
        forwardRef(() => AssistantBindingModule),
        forwardRef(() => EnvironmentModule),
        forwardRef(() => ChatConversationModule),
        forwardRef(() => ChatMessageModule),
        forwardRef(() => ChatMessageFeedbackModule),
        forwardRef(() => FileUnderstandingModule),
        SseStreamModule,
        forwardRef(() => XpertAgentExecutionModule),
        XpertProjectModule
    ],
    controllers: [
        AIController,
        AIV1Controller,
        ContextsController,
        KnowledgesController,
        AssistantsController,
        RuntimeResourceController,
        ConnectorRuntimeController,
        ThreadsController,
        ConversationsController,
        StoreController
    ],
    providers: [
        AiService,
        RuntimeCommandService,
        RuntimeCapabilitiesService,
        ConversationAgentRunsService,
        ...CommandHandlers,
        ...QueryHandlers
    ]
})
export class AIModule {}
