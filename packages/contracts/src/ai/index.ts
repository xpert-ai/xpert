export const STATE_VARIABLE_HUMAN = 'human'

export enum ChatMessageTypeEnum {
	MESSAGE = 'message',
	EVENT = 'event'
}

export enum ChatMessageEventTypeEnum {
	ON_CONVERSATION_START = 'on_conversation_start',
	ON_CONVERSATION_END = 'on_conversation_end',
	ON_MESSAGE_START = 'on_message_start',
	ON_MESSAGE_END = 'on_message_end',
	ON_TOOL_START = 'on_tool_start',
	ON_TOOL_END = 'on_tool_end',
	ON_TOOL_ERROR = 'on_tool_error',
	ON_TOOL_MESSAGE = 'on_tool_message',
	ON_AGENT_START = 'on_agent_start',
	ON_AGENT_END = 'on_agent_end',
	ON_RETRIEVER_START = 'on_retriever_start',
	ON_RETRIEVER_END = 'on_retriever_end',
	ON_RETRIEVER_ERROR = 'on_retriever_error',
	ON_INTERRUPT = 'on_interrupt',
	ON_ERROR = 'on_error',
	ON_CHAT_EVENT = 'on_chat_event',
	ON_CLIENT_EFFECT = 'on_client_effect'
}

export enum ChatMessageStepCategory {
	List = 'list',
	WebSearch = 'web_search',
	Files = 'files',
	File = 'file',
	Program = 'program',
	Iframe = 'iframe',
	Memory = 'memory',
	Tasks = 'tasks',
	Knowledges = 'knowledges'
}

export type * from '@xpert-ai/chatkit-types'
export type { TChatRequest } from './xpert-chat.model'
export * from './assistant-config.model'
export * from './ai-model.model'
export * from './ai.model'
export * from './chat.model'
export * from './chat-message.model'
export * from './chat-message-feedback.model'
export * from './copilot-checkpoint.model'
export * from './copilot-example.model'
export * from './copilot-model.model'
export * from './copilot-organization.model'
export * from './copilot-provider.model'
export * from './copilot-store.model'
export * from './copilot-user.model'
export * from './copilot.model'
export * from './feature.model'
export * from './rag'
export * from './rag-web'
export * from './knowledgebase.model'
export * from './knowledge-doc.model'
export * from './knowledge-doc-page.model'
export * from './role-permissions'
export * from './xpert-agent-execution.model'
export * from './xpert-agent.model'
export * from './xpert-chat.model'
export * from './xpert-tool.model'
export * from './xpert-toolset.model'
export * from './xpert-workspace.model'
export * from './xpert-table.model'
export * from './xpert.model'
export * from './xpert.utils'
export * from './types'
export * from './xpert-template.model'
export * from './xpert-task.model'
export * from './xpert-workflow.model'
export * from './xpert-workflow-task.prompt'
export * from './xpert-tool-mcp.model'
export * from './xpert-project.model'
export * from './environment.model'
export * from './knowledgebase-task.model'
export * from './knowledge-pipeline'
export * from './knowledge-retrieval-log.model'
export * from './knowledge-doc-chunk.model'
export * from './skill.model'
export * from './middleware.model'
export * from './sandbox'
export * from './message-content.utils'
