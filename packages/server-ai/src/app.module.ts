import { UserModule } from '@metad/server-core'
import { Module, forwardRef } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { ScheduleModule } from '@nestjs/schedule'
import { AIModule } from './ai'
import { ChatModule } from './chat'
import { ChatConversationModule } from './chat-conversation'
import { CopilotModule } from './copilot'
import { CopilotCheckpointModule } from './copilot-checkpoint'
import { CopilotKnowledgeModule } from './copilot-knowledge'
import { CopilotOrganizationModule } from './copilot-organization'
import { CopilotUserModule } from './copilot-user'
import { EventHandlers } from './core/events'
import { GraphragModule } from './graphrag/graphrag.module'
import { IntegrationLarkModule } from './integration-lark/index'
import { KnowledgeDocumentModule } from './knowledge-document/index'
import { KnowledgebaseModule } from './knowledgebase/index'
import { XpertToolModule } from './xpert-tool/index'
import { XpertToolsetModule } from './xpert-toolset/index'
import { XpertAgentModule } from './xpert-agent/index'
import { XpertWorkspaceModule } from './xpert-workspace'
import { XpertModule } from './xpert'
import { CopilotModelModule } from './copilot-model'
import { XpertAgentExecutionModule } from './xpert-agent-execution'
import { CopilotProviderModule } from './copilot-provider'
import { CopilotStoreModule } from './copilot-store/copilot-store.module'
import { ChatMessageModule } from './chat-message'
import { ChatMessageFeedbackModule } from './chat-message-feedback'
import { XpertTemplateModule } from './xpert-template/xpert-template.module'
import { XpertTaskModule } from './xpert-task'
import { RagWebModule } from './rag-web/rag-web.module'
import { IntegrationFirecrawlModule } from './integration-firecrawl/firecrawl.module'

@Module({
	imports: [
		forwardRef(() => CqrsModule),
		forwardRef(() => UserModule),
		ScheduleModule.forRoot(),
		KnowledgebaseModule,
		KnowledgeDocumentModule,
		ChatModule,
		ChatConversationModule,
		ChatMessageModule,
		ChatMessageFeedbackModule,
		CopilotCheckpointModule,
		AIModule,
		CopilotModule,
		CopilotModelModule,
		CopilotKnowledgeModule,
		CopilotUserModule,
		CopilotOrganizationModule,
		CopilotProviderModule,
		CopilotStoreModule,
		GraphragModule,
		XpertModule,
		XpertAgentModule,
		XpertAgentExecutionModule,
		XpertToolModule,
		XpertToolsetModule,
		XpertWorkspaceModule,
		XpertTemplateModule,
		XpertTaskModule,
		IntegrationLarkModule,
		IntegrationFirecrawlModule,
		RagWebModule
	],
	controllers: [],
	providers: [...EventHandlers]
})
export class ServerAIModule {}
