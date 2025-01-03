import { ChatOpenAI, ChatOpenAIFields, ClientOptions } from '@langchain/openai'
import { AIModelEntity, AiModelTypeEnum, ICopilotModel } from '@metad/contracts'
import { sumTokenUsage } from '@metad/copilot'
import { getErrorMessage } from '@metad/server-common'
import { Injectable } from '@nestjs/common'
import { AIModel } from '../../../ai-model'
import { ModelProvider } from '../../../ai-provider'
import { TChatModelOptions } from '../../../types/types'
import { CredentialsValidateFailedError } from '../../errors'
import { OpenAICompatModelCredentials, toCredentialKwargs } from '../types'

export type TOAIAPICompatLLMParams = ChatOpenAIFields & { configuration: ClientOptions }

@Injectable()
export class OAIAPICompatLargeLanguageModel extends AIModel {
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
				temperature: 0
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
		credentials ??= options?.modelProperties as OpenAICompatModelCredentials
		const params = toCredentialKwargs(credentials)

		const { handleLLMTokens } = options ?? {}
		return this.createChatModel({
			...params,
			model: copilotModel.model,
			streaming: copilotModel.options?.streaming ?? true,
			temperature: copilotModel.options?.temperature ?? 0,
			maxTokens: copilotModel.options?.max_tokens,
			streamUsage: false,
			callbacks: [
				{
					handleLLMEnd(output) {
						if (handleLLMTokens) {
							handleLLMTokens({
								copilot,
								tokenUsed: output.llmOutput?.totalTokens ?? sumTokenUsage(output)
							})
						}
					}
				}
			]
		})
	}
}
