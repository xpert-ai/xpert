import { ChatMessageSubscriber } from '../../chat-message/chat-message.subscriber'
import { CopilotModelSubscriber } from '../../copilot-model/copilot-model.subscriber'
import { KnowledgebaseSubscriber } from '../../knowledgebase/knowledgebase.subscriber'
import { XpertToolSubscriber } from '../../xpert-tool/xpert-tool.subscriber'
import { XpertToolsetSubscriber } from '../../xpert-toolset/xpert-toolset.subscriber'
import { XpertSubscriber } from '../../xpert/xpert.subscriber'

/**
 * A map of the core TypeORM Subscribers.
 */
export const AiSubscribers = [
	KnowledgebaseSubscriber,
	XpertSubscriber,
	XpertToolsetSubscriber,
	XpertToolSubscriber,
	CopilotModelSubscriber,
	ChatMessageSubscriber
]
