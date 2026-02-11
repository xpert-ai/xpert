import { UserModule } from '@metad/server-core'
import { Module, forwardRef } from '@nestjs/common'
import { CqrsModule, CommandBus } from '@nestjs/cqrs'
import type { Provider } from '@nestjs/common'
import { RequestContext } from '@metad/server-core'
import { CORE_PLUGIN_API_TOKENS, CoreChatApi, CoreHandoffApi } from '@xpert-ai/plugin-sdk'
import { AIModule } from './ai'
import { ChatModule } from './chat'
import { ChatCommand } from './chat/commands'
import { ChatConversationModule } from './chat-conversation'
import { ChatConversationService } from './chat-conversation'
import { ChatMessageModule } from './chat-message'
import { ChatMessageUpsertCommand } from './chat-message/commands'
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
import { KnowledgeDocumentModule } from './knowledge-document/index'
import { KnowledgebaseModule } from './knowledgebase/index'
import { RagWebModule } from './rag-web/rag-web.module'
import { SandboxModule } from './sandbox/sandbox.module'
import { CommandHandlers } from './shared'
import { XpertModule } from './xpert'
import { XpertAgentExecutionModule } from './xpert-agent-execution'
import { XpertAgentModule } from './xpert-agent/index'
import { XpertProjectModule } from './xpert-project/project.module'
import { XpertTaskModule } from './xpert-task'
import { XpertTemplateModule } from './xpert-template/xpert-template.module'
import { XpertToolModule } from './xpert-tool/index'
import { XpertToolsetModule } from './xpert-toolset/index'
import { XpertWorkspaceModule } from './xpert-workspace'
import { RagVStoreModule } from './rag-vstore'
import { IntegrationGithubModule } from './integration-github'
import { EnvironmentModule } from './environment'
import { XpertTableModule } from './xpert-table'
import { ExecutionQueueModule } from './handoff'
import { ExecutionQueueService } from './handoff'
import { HandoffQueueService } from './handoff'

const CoreChatApiProvider: Provider = {
	provide: CORE_PLUGIN_API_TOKENS.chat,
	useFactory: (commandBus, conversationService): CoreChatApi => ({
		chatXpert: async (request, options) => {
			const tenantId = options?.tenantId ?? RequestContext.currentTenantId()
			const organizationId = options?.organizationId ?? RequestContext.getOrganizationId()
			const user = options?.user ?? RequestContext.currentUser()

			if (!tenantId || !organizationId || !user) {
				throw new Error('Missing request context for core chat api')
			}

			return await commandBus.execute(
				new ChatCommand(request, {
					...(options ?? {}),
					tenantId,
					organizationId,
					user
				})
			)
		},
		upsertChatMessage: async (entity) => {
			await commandBus.execute(new ChatMessageUpsertCommand(entity))
		},
		getChatConversation: async (id, relations) => {
			try {
				return await conversationService.findOne(id, relations?.length ? { relations } : undefined)
			} catch {
				return null
			}
		}
	}),
	inject: [CommandBus, ChatConversationService]
}

const CoreHandoffApiProvider: Provider = {
	provide: CORE_PLUGIN_API_TOKENS.handoff,
	useFactory: (
		handoffQueue: HandoffQueueService,
		executionQueue: ExecutionQueueService
	): CoreHandoffApi => ({
		enqueue: async (message, options) => handoffQueue.enqueue(message as any, options),
		enqueueAndWait: async (message, options) =>
			handoffQueue.enqueueAndWait(message as any, options as any),
		abortByRunId: (runId, reason) => executionQueue.abortByRunId(runId, reason),
		abortBySessionKey: (sessionKey, reason) =>
			executionQueue.abortBySessionKey(sessionKey, reason),
		abortByIntegration: (integrationId, reason) =>
			executionQueue.abortByIntegration(integrationId, reason),
		getIntegrationRunCount: (integrationId) =>
			executionQueue.getRunCountByIntegration(integrationId),
		getIntegrationRunIds: (integrationId) =>
			executionQueue.getRunsByIntegration(integrationId).map((run) => run.runId)
	}),
	inject: [HandoffQueueService, ExecutionQueueService]
}

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
		XpertTableModule,
		KnowledgebaseModule,
		KnowledgeDocumentModule,
		IntegrationGithubModule,
		RagVStoreModule,
		RagWebModule,
		SandboxModule,
		ExecutionQueueModule,
	],
	controllers: [],
	providers: [
		...EventHandlers,
		...CommandHandlers,
		CoreChatApiProvider,
		CoreHandoffApiProvider
	]
})
export class ServerAIModule {}
