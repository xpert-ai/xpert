import { AgentChatHandoffProcessor } from './agent-chat/agent-chat.processor'
import {
	AgentChatDispatchHandoffProcessor,
} from './agent-chat/agent-chat-dispatch.processor'
import {
	AgentChatCallbackNoopHandoffProcessor
} from './agent-chat/agent-chat-callback-noop.processor'

export const Processors = [
	AgentChatHandoffProcessor,
	AgentChatDispatchHandoffProcessor,
	AgentChatCallbackNoopHandoffProcessor,
]
