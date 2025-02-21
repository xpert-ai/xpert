import { ChatOpenAI } from '@langchain/openai'
import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { Injectable, Logger } from '@nestjs/common'
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
		const fields = {
			...params,
			model,
			streaming: modelCredentials?.streaming ?? true,
			temperature: modelCredentials?.temperature ?? 0,
			maxTokens: modelCredentials?.max_tokens,
			topP: modelCredentials?.top_p,
			frequencyPenalty: modelCredentials?.frequency_penalty,
			maxRetries: modelCredentials?.maxRetries,
			streamUsage: false
		}
		return new ChatOpenAI({
			...fields,
			callbacks: [
				...this.createHandleUsageCallbacks(copilot, model, credentials, handleLLMTokens),
				this.createHandleLLMErrorCallbacks(fields, this.#logger)
			]
		})
	}
}
