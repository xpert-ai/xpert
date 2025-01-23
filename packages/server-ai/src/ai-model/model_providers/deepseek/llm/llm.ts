import { ChatOpenAI } from '@langchain/openai'
import { AIModelEntity, AiModelTypeEnum, ICopilotModel } from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { Injectable } from '@nestjs/common'
import { ModelProvider } from '../../../ai-provider'
import { LargeLanguageModel } from '../../../llm'
import { TChatModelOptions } from '../../../types/types'
import { CredentialsValidateFailedError } from '../../errors'
import { DeepseekCredentials, DeepseekModelCredentials, toCredentialKwargs } from '../types'

@Injectable()
export class DeepseekLargeLanguageModel extends LargeLanguageModel {
	constructor(readonly modelProvider: ModelProvider) {
		super(modelProvider, AiModelTypeEnum.LLM)
	}

	async validateCredentials(model: string, credentials: DeepseekCredentials): Promise<void> {
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
	protected getCustomizableModelSchemaFromCredentials(
		model: string,
		credentials: Record<string, any>
	): AIModelEntity | null {
		throw new Error('Method not implemented.')
	}

	override getChatModel(copilotModel: ICopilotModel, options?: TChatModelOptions) {
		const { copilot } = copilotModel
		const { modelProvider } = copilot
		const credentials = modelProvider.credentials as DeepseekCredentials
		const params = toCredentialKwargs(credentials)
		const modelCredentials = copilotModel.options as DeepseekModelCredentials

		const model = copilotModel.model
		const { handleLLMTokens } = options ?? {}
		return new ChatOpenAI({
			...params,
			model,
			streaming: modelCredentials?.streaming ?? true,
			temperature: modelCredentials?.temperature ?? 0,
			maxTokens: modelCredentials?.max_tokens,
			topP: modelCredentials?.top_p,
			frequencyPenalty: modelCredentials?.frequency_penalty,
			streamUsage: false,
			callbacks: [...this.createHandleUsageCallbacks(copilot, model, credentials, handleLLMTokens)]
		})
	}
}
