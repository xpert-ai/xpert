import { ChatOpenAICompletions, ChatOpenAIFields, ClientOptions, OpenAIClient } from '@langchain/openai'

export type TOAIAPICompatLLMParams = ChatOpenAIFields & { configuration: ClientOptions }


/**
 * A model extended from ChatOpenAICompletions, compatible with OpenAI-style chat completions,
 * and supports structuring content within `<think>` reasoning tags into the `reasoning_content` field.
 *
 * This class overrides the `_convertCompletionsDeltaToBaseMessageChunk` method to detect `<think>` and `</think>` tags in the completion stream:
 * - When `<think>` is encountered, it enters reasoning content collection mode. Subsequent content is collected into the `reasoning_content` field and does not appear in the main `content` field.
 * - When `</think>` is encountered, reasoning content collection ends.
 * - In other cases, the `reasoning_content` field is directly assigned from the `reasoning_content` in the delta.
 *
 * In this way, the reasoning process in the model output can be separated from the main content, making it easier for subsequent structured processing and display.
 */
export class ChatOAICompatReasoningModel extends ChatOpenAICompletions {
	private thinking = false
	/**
	 * 
	 */
	protected override _convertCompletionsDeltaToBaseMessageChunk(
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		delta: Record<string, any>,
		rawResponse: OpenAIClient.ChatCompletionChunk,
		defaultRole?: 'function' | 'user' | 'system' | 'developer' | 'assistant' | 'tool'
	) {
		const messageChunk = super._convertCompletionsDeltaToBaseMessageChunk(delta, rawResponse, defaultRole)
		if (delta['content'] === '<think>') {
			this.thinking = true
			messageChunk.content = ''
		} else if (delta['content'] === '</think>') {
			this.thinking = false
			messageChunk.content = ''
		} else if (this.thinking) {
			messageChunk.additional_kwargs['reasoning_content'] = messageChunk.content
			messageChunk.content = ''
		} else {
			messageChunk.additional_kwargs['reasoning_content'] = delta['reasoning_content']
		}
		return messageChunk
	}

	protected override _convertCompletionsMessageToBaseMessage(
		message: OpenAIClient.ChatCompletionMessage,
		rawResponse: OpenAIClient.ChatCompletion
	) {
		const langChainMessage = super._convertCompletionsMessageToBaseMessage(message, rawResponse)
		console.log(langChainMessage.content)
		
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		if ((message as any).reasoning_content) {
			langChainMessage.additional_kwargs['reasoning_content'] = (message as any).reasoning_content
		} else if (typeof langChainMessage.content === 'string') {
			const match = langChainMessage.content.match(/<think>([\s\S]*?)<\/think>/)
			if (match) {
				langChainMessage.additional_kwargs['reasoning_content'] = match[1]
				langChainMessage.content = langChainMessage.content.replace(match[0], '')
			}
		}
		return langChainMessage
	}
}