import { ChatOpenAI, ChatOpenAIFields, ClientOptions } from '@langchain/openai'
import { AIModelEntity, AiModelTypeEnum, ICopilotModel } from '@metad/contracts'
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

	protected getCustomizableModelSchemaFromCredentials(
		model: string,
		credentials: Record<string, any>
	): AIModelEntity | null {
		throw new Error('Method not implemented.')
	}

	async validateCredentials(model: string, credentials: OpenAICompatModelCredentials): Promise<void> {
		const params = toCredentialKwargs(credentials, model)

		try {
			const chatModel = this.createChatModel({
				...params,
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
			callbacks: [
				...this.createHandleUsageCallbacks(copilot, model, credentials, handleLLMTokens)
			]
		})
	}

	canSteaming(model: string) {
		return !model.startsWith('o1')
	}
}
