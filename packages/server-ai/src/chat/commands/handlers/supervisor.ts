import { LanguageModelLike } from '@langchain/core/language_models/base'
import { BaseChatModel, BindToolsInput } from '@langchain/core/language_models/chat_models'

export type OutputMode = 'full_history' | 'last_message'
export const PROVIDERS_WITH_PARALLEL_TOOL_CALLS_PARAM = new Set(['ChatOpenAI'])

// type guards
type ChatModelWithBindTools = BaseChatModel & {
	bindTools(tools: BindToolsInput[], kwargs?: unknown): LanguageModelLike
}

type ChatModelWithParallelToolCallsParam = BaseChatModel & {
	bindTools(
		tools: BindToolsInput[],
		kwargs?: { parallel_tool_calls?: boolean } & Record<string, unknown>
	): LanguageModelLike
}

export function isChatModelWithBindTools(llm: LanguageModelLike): llm is ChatModelWithBindTools {
	return (
		'_modelType' in llm &&
		typeof llm._modelType === 'function' &&
		llm._modelType() === 'base_chat_model' &&
		'bindTools' in llm &&
		typeof llm.bindTools === 'function'
	)
}

export function isChatModelWithParallelToolCallsParam(
	llm: ChatModelWithBindTools
): llm is ChatModelWithParallelToolCallsParam {
	return llm.bindTools.length >= 2
}
