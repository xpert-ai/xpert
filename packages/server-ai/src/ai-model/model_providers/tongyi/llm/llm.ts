import { ChatOpenAI, ChatOpenAICallOptions, OpenAIClient } from '@langchain/openai'
import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { Injectable, Logger } from '@nestjs/common'
import { isNil, omitBy } from 'lodash'
import { ModelProvider } from '../../../ai-provider'
import { LargeLanguageModel } from '../../../llm'
import { TChatModelOptions } from '../../../types/types'
import { CredentialsValidateFailedError } from '../../errors'
import { QWenModelCredentials, toCredentialKwargs, TongyiCredentials } from '../types'

@Injectable()
export class TongyiLargeLanguageModel extends LargeLanguageModel {
	readonly #logger = new Logger(TongyiLargeLanguageModel.name)

	constructor(readonly modelProvider: ModelProvider) {
		super(modelProvider, AiModelTypeEnum.LLM)
	}

	async validateCredentials(model: string, credentials: TongyiCredentials): Promise<void> {
		try {
			const chatModel = new ChatOpenAI({
				...toCredentialKwargs(credentials),
				model,
				temperature: 0,
				maxTokens: 5
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

	override getChatModel(copilotModel: ICopilotModel, options?: TChatModelOptions) {
		const { handleLLMTokens } = options ?? {}
		const { copilot } = copilotModel
		const { modelProvider } = copilot
		const credentials = modelProvider.credentials as TongyiCredentials
		const params = toCredentialKwargs(credentials)
		const modelCredentials = copilotModel.options as QWenModelCredentials

		const model = copilotModel.model
		const fields = omitBy(
			{
				...params,
				model,
				streaming: modelCredentials?.streaming ?? true,
				temperature: modelCredentials?.temperature ?? 0,
				maxTokens: modelCredentials?.max_tokens,
				topP: modelCredentials?.top_p,
				frequencyPenalty: modelCredentials?.frequency_penalty,
				maxRetries: modelCredentials?.maxRetries,
				// enable_thinking: modelCredentials?.enable_thinking,
				modelKwargs: omitBy(
					{
						enable_thinking: modelCredentials?.enable_thinking,
						thinking_budget: modelCredentials?.thinking_budget,
						enable_search: modelCredentials?.enable_search
					},
					isNil
				),
				streamUsage: false
			},
			isNil
		)
		return new ChatTongyi({
			...fields,
			callbacks: [
				...this.createHandleUsageCallbacks(copilot, model, credentials, handleLLMTokens),
				this.createHandleLLMErrorCallbacks(fields, this.#logger)
			]
		})
	}
}

export interface ChatDeepSeekCallOptions extends ChatOpenAICallOptions {
	headers?: Record<string, string>
}

type OpenAIRoleEnum = 'system' | 'developer' | 'assistant' | 'user' | 'function' | 'tool'

export class ChatTongyi extends ChatOpenAI<ChatDeepSeekCallOptions> {
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
