import { ChatOpenAI } from '@langchain/openai'
import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { Injectable, Logger } from '@nestjs/common'
import { isNil, omitBy } from 'lodash'
import { ModelProvider } from '../../../ai-provider'
import { LargeLanguageModel } from '../../../llm'
import { TChatModelOptions } from '../../../types/types'
import { CredentialsValidateFailedError } from '../../errors'
import { QWenModelCredentials, toCredentialKwargs, TongyiCredentials } from '../types'
import { ChatOAICompatReasoningModel } from '../../openai_api_compatible'

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
				// include token usage in the stream. this will include an additional chunk at the end of the stream with the token usage.
				streamUsage: true
			},
			isNil
		)
		return new ChatOAICompatReasoningModel({
			...fields,
			verbose: options?.verbose,
			callbacks: [
				...this.createHandleUsageCallbacks(copilot, model, credentials, handleLLMTokens),
				this.createHandleLLMErrorCallbacks(fields, this.#logger)
			]
		})
	}
}
