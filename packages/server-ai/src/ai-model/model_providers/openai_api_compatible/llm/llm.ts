import { ChatOpenAI, ChatOpenAICallOptions, ChatOpenAIFields, ClientOptions, OpenAIClient } from '@langchain/openai'
import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { Injectable } from '@nestjs/common'
import { ModelProvider } from '../../../ai-provider'
import { TChatModelOptions } from '../../../types/types'
import { CredentialsValidateFailedError } from '../../errors'
import { OpenAICompatModelCredentials, toCredentialKwargs } from '../types'
import { LargeLanguageModel } from '../../../llm'

export type TOAIAPICompatLLMParams = ChatOpenAIFields & { configuration: ClientOptions }

@Injectable()
export class OAIAPICompatLargeLanguageModel extends LargeLanguageModel {
	constructor(readonly modelProvider: ModelProvider) {
		super(modelProvider, AiModelTypeEnum.LLM)
	}

	async validateCredentials(model: string, credentials: OpenAICompatModelCredentials): Promise<void> {
		const params = toCredentialKwargs(credentials, model)

		try {
			const chatModel = this.createChatModel({
				...params,
				temperature: 0,
				maxTokens: 5,
			})
			await chatModel.invoke([
				{
					role: 'human',
					content: `Hi`
				}
			])
		} catch (err) {
			throw new CredentialsValidateFailedError(getErrorMessage(err))
		}
	}

	protected createChatModel(params: TOAIAPICompatLLMParams) {
		return new ChatOpenAI(params)
	}

	override getChatModel(
		copilotModel: ICopilotModel,
		options?: TChatModelOptions,
		credentials?: OpenAICompatModelCredentials
	) {
		const { copilot } = copilotModel
		const { handleLLMTokens } = options ?? {}

		credentials ??= options?.modelProperties as OpenAICompatModelCredentials
		const params = toCredentialKwargs(credentials)
		const model = copilotModel.model
		
		return this.createChatModel({
			...params,
			model,
			streaming: copilotModel.options?.streaming ?? this.canSteaming(model),
			temperature: copilotModel.options?.temperature ?? 0,
			maxTokens: copilotModel.options?.max_tokens,
			streamUsage: false,
			verbose: options?.verbose,
			callbacks: [
				...this.createHandleUsageCallbacks(copilot, model, credentials, handleLLMTokens)
			]
		})
	}

	canSteaming(model: string) {
		return !model.startsWith('o1')
	}
}


export interface ChatReasoningCallOptions extends ChatOpenAICallOptions {
	headers?: Record<string, string>
}

type OpenAIRoleEnum = 'system' | 'developer' | 'assistant' | 'user' | 'function' | 'tool'

export class ChatReasoningModel extends ChatOpenAI<ChatReasoningCallOptions> {
	protected override _convertOpenAIDeltaToBaseMessageChunk(
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		delta: Record<string, any>,
		rawResponse: OpenAIClient.ChatCompletionChunk,
		defaultRole?: OpenAIRoleEnum
	) {
		const messageChunk = super._convertOpenAIDeltaToBaseMessageChunk(delta, rawResponse, defaultRole)
		messageChunk.additional_kwargs.reasoning_content = delta.reasoning_content
		return messageChunk
	}

	protected override _convertOpenAIChatCompletionMessageToBaseMessage(
		message: OpenAIClient.ChatCompletionMessage,
		rawResponse: OpenAIClient.ChatCompletion
	) {
		const langChainMessage = super._convertOpenAIChatCompletionMessageToBaseMessage(message, rawResponse)
		langChainMessage.additional_kwargs.reasoning_content =
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(message as any).reasoning_content
		return langChainMessage
	}
}
