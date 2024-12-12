import { ToolCall } from '@langchain/core/dist/messages/tool'
import { BaseMessage } from '@langchain/core/messages'
import { Annotation, messagesStateReducer } from '@langchain/langgraph'

export const AgentStateAnnotation = Annotation.Root({
	messages: Annotation<BaseMessage[]>({
		reducer: messagesStateReducer,
		default: () => []
	}),
    input: Annotation<string>({
		reducer: (a, b) => b ?? a,
		default: () => ''
	}),
    language: Annotation<string>({
		reducer: (a, b) => b ?? a,
		default: () => null
	}),
    toolCall: Annotation<ToolCall>({
		reducer: (a, b) => b ?? a,
		default: () => null
	}),
})
