import { ToolCall } from '@langchain/core/dist/messages/tool'
import { BaseMessage } from '@langchain/core/messages'
import { Runnable, RunnableLike, RunnableToolLike } from '@langchain/core/runnables'
import { StructuredToolInterface } from '@langchain/core/tools'
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

export type TSubAgent = {
	name: string;
	tool: StructuredToolInterface | RunnableToolLike;
	node: RunnableLike<typeof AgentStateAnnotation> | Runnable
}