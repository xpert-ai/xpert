import { UserModule } from '@metad/server-core'
import { Module, forwardRef } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { AIModule } from './ai'
import { ChatModule } from './chat'
import { ChatConversationModule } from './chat-conversation'
import { ChatMessageModule } from './chat-message'
import { ChatMessageFeedbackModule } from './chat-message-feedback'
import { CopilotModule } from './copilot'
import { CopilotCheckpointModule } from './copilot-checkpoint'
import { CopilotKnowledgeModule } from './copilot-knowledge'
import { CopilotModelModule } from './copilot-model'
import { CopilotOrganizationModule } from './copilot-organization'
import { CopilotProviderModule } from './copilot-provider'
import { CopilotStoreModule } from './copilot-store/copilot-store.module'
import { CopilotUserModule } from './copilot-user'
import { EventHandlers } from './core/events'
import { GraphragModule } from './graphrag/graphrag.module'
import { IntegrationLarkModule } from './integration-lark/index'
import { KnowledgeDocumentModule } from './knowledge-document/index'
import { KnowledgebaseModule } from './knowledgebase/index'
import { RagWebModule } from './rag-web/rag-web.module'
import { SandboxModule } from './sandbox/sandbox.module'
import { XpertModule } from './xpert'
import { XpertAgentExecutionModule } from './xpert-agent-execution'
import { XpertAgentModule } from './xpert-agent/index'
import { XpertProjectModule } from './xpert-project/project.module'
import { XpertTaskModule } from './xpert-task'
import { XpertTemplateModule } from './xpert-template/xpert-template.module'
import { XpertToolModule } from './xpert-tool/index'
import { XpertToolsetModule } from './xpert-toolset/index'
import { XpertWorkspaceModule } from './xpert-workspace'
import { CommandHandlers } from './shared'
import { RagVStoreModule } from './rag-vstore'
import { IntegrationGithubModule } from './integration-github'
import { EnvironmentModule } from './environment'

@Module({
	imports: [
		forwardRef(() => CqrsModule),
		forwardRef(() => UserModule),
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
		EnvironmentModule,
		GraphragModule,
		XpertModule,
		XpertAgentModule,
		XpertAgentExecutionModule,
		XpertToolModule,
		XpertToolsetModule,
		XpertWorkspaceModule,
		XpertProjectModule,
		XpertTemplateModule,
		XpertTaskModule,
		KnowledgebaseModule,
		KnowledgeDocumentModule,
		IntegrationLarkModule,
		IntegrationGithubModule,
		RagVStoreModule,
		RagWebModule,
		SandboxModule,
	],
	controllers: [],
	providers: [...EventHandlers, ...CommandHandlers]
})
export class ServerAIModule {}
