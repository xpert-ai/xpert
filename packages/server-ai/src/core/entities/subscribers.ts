import { ChatConversationSubscriber } from '../../chat-conversation/conversation.subscriber'
import { ChatMessageSubscriber } from '../../chat-message/chat-message.subscriber'
import { CopilotModelSubscriber } from '../../copilot-model/copilot-model.subscriber'
import { KnowledgeDocumentSubscriber } from '../../knowledge-document/document.subscriber'
import { KnowledgebaseSubscriber } from '../../knowledgebase/knowledgebase.subscriber'
import { XpertProjectTaskSubscriber } from '../../xpert-project/entities/project-task.subscriber'
import { XpertProjectSubscriber } from '../../xpert-project/project.subscriber'
import { XpertToolSubscriber } from '../../xpert-tool/xpert-tool.subscriber'
import { XpertToolsetSubscriber } from '../../xpert-toolset/xpert-toolset.subscriber'
import { XpertSubscriber } from '../../xpert/xpert.subscriber'

/**
 * A map of the core TypeORM Subscribers.
 */
export const AiSubscribers = [
	KnowledgebaseSubscriber,
	XpertSubscriber,
	XpertProjectSubscriber,
	XpertToolsetSubscriber,
	XpertToolSubscriber,
	XpertProjectTaskSubscriber,
	CopilotModelSubscriber,
	ChatConversationSubscriber,
	ChatMessageSubscriber,
	KnowledgeDocumentSubscriber
]
