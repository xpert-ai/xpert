import { ChatOpenAICompletions, ChatOpenAIFields, ClientOptions, OpenAIClient } from '@langchain/openai'

export type TOAIAPICompatLLMParams = ChatOpenAIFields & { configuration: ClientOptions }


export class ChatOAICompatReasoningModel extends ChatOpenAICompletions {
	protected override _convertCompletionsDeltaToBaseMessageChunk(
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		delta: Record<string, any>,
		rawResponse: OpenAIClient.ChatCompletionChunk,
		defaultRole?: 'function' | 'user' | 'system' | 'developer' | 'assistant' | 'tool'
	) {
		const messageChunk = super._convertCompletionsDeltaToBaseMessageChunk(delta, rawResponse, defaultRole)
		messageChunk.additional_kwargs['reasoning_content'] = delta['reasoning_content']
		return messageChunk
	}

	protected override _convertCompletionsMessageToBaseMessage(
		message: OpenAIClient.ChatCompletionMessage,
		rawResponse: OpenAIClient.ChatCompletion
	) {
		const langChainMessage = super._convertCompletionsMessageToBaseMessage(message, rawResponse)
		langChainMessage.additional_kwargs['reasoning_content'] =
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(message as any).reasoning_content
		return langChainMessage
	}
}