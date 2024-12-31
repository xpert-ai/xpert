import { ToolCall } from '@langchain/core/dist/messages/tool'
import { BaseMessage } from '@langchain/core/messages'
import { Runnable, RunnableLike, RunnableToolLike } from '@langchain/core/runnables'
import { StructuredToolInterface } from '@langchain/core/tools'
import { Annotation, messagesStateReducer } from '@langchain/langgraph'
import { SearchItem } from '@langchain/langgraph-checkpoint'

export const AgentStateAnnotation = Annotation.Root({
	messages: Annotation<BaseMessage[]>({
		reducer: messagesStateReducer,
		default: () => []
	}),
    input: Annotation<string>({
		reducer: (a, b) => b ?? a,
		default: () => ''
	}),
    sys_language: Annotation<string>({
		reducer: (a, b) => b ?? a,
		default: () => null
	}),
    toolCall: Annotation<ToolCall>({
		reducer: (a, b) => b ?? a,
		default: () => null
	}),
	/**
	 * The short title of conversation
	 */
	title: Annotation<string>({
		reducer: (a, b) => b ?? a,
		default: () => null
	}),
	/**
	 * Summarizing past conversations if it's too long
	 */
	summary: Annotation<string>({
		reducer: (a, b) => b ?? a,
		default: () => null
	}),
	/**
	 * Long term memory retrieved 
	 */
	memories: Annotation<SearchItem[]>({
		reducer: (a, b) => b ?? a,
		default: () => null
	}),
})

export type TSubAgent = {
	name: string;
	tool: StructuredToolInterface | RunnableToolLike;
	node: RunnableLike<typeof AgentStateAnnotation> | Runnable
}

export function parseXmlString(content: string) {
	return content?.replace(/&lt;/g, '<').replace(/&gt;/g, '>')
}