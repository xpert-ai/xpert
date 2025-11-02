import { ChatOpenAI, ChatOpenAIFields, ClientOptions } from '@langchain/openai'
import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { OpenAICompatModelCredentials, toCredentialKwargs } from '../types'
import { ChatOAICompatReasoningModel, CredentialsValidateFailedError, getErrorMessage, LargeLanguageModel, TChatModelOptions } from '@xpert-ai/plugin-sdk'
import { OpenAICompatibleProviderStrategy } from '../provider.strategy'

export type TOAIAPICompatLLMParams = ChatOpenAIFields & { configuration: ClientOptions }

@Injectable()
export class OAIAPICompatLargeLanguageModel extends LargeLanguageModel {
	constructor(modelProvider: OpenAICompatibleProviderStrategy) {
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
		/**
		 * @todo ChatOpenAICompletions vs ChatOpenAI
		 */
		return new ChatOAICompatReasoningModel(params)
	}

	override getChatModel(
		copilotModel: ICopilotModel,
		options?: TChatModelOptions,
		credentials?: OpenAICompatModelCredentials
	) {
		const { copilot } = copilotModel
		const { handleLLMTokens } = options ?? {}

		credentials ??= options?.modelProperties as OpenAICompatModelCredentials
		const params = toCredentialKwargs(credentials, copilotModel.model)
		
		return this.createChatModel({
			...params,
			streaming: copilotModel.options?.['streaming'] ?? this.canSteaming(params.model),
			temperature: copilotModel.options?.['temperature'] ?? 0,
			maxTokens: copilotModel.options?.['max_tokens'],
			streamUsage: false,
			verbose: options?.verbose,
			callbacks: [
				...this.createHandleUsageCallbacks(copilot, params.model, credentials, handleLLMTokens)
			]
		})
	}

	canSteaming(model: string) {
		return !model.startsWith('o1')
	}
}
