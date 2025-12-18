import { ChatDeepSeek } from '@langchain/deepseek'
import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { Injectable, Logger } from '@nestjs/common'
import { ModelProvider } from '../../../ai-provider'
import { LargeLanguageModel } from '../../../llm'
import { TChatModelOptions } from '../../../types/types'
import { CredentialsValidateFailedError } from '../../errors'
import { DeepseekCredentials, DeepseekModelCredentials, toCredentialKwargs } from '../types'

/**
 * @deprecated This class has been migrated to xpert-plugins project.
 * 此类已迁移到 xpert-plugins 项目。
 */
@Injectable()
export class DeepseekLargeLanguageModel extends LargeLanguageModel {
	readonly #logger = new Logger(DeepseekLargeLanguageModel.name)

	constructor(readonly modelProvider: ModelProvider) {
		super(modelProvider, AiModelTypeEnum.LLM)
	}

	async validateCredentials(model: string, credentials: DeepseekCredentials): Promise<void> {
		try {
			const chatModel = new ChatDeepSeek({
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
		const credentials = modelProvider.credentials as DeepseekCredentials
		const params = toCredentialKwargs(credentials)
		const modelCredentials = copilotModel.options as DeepseekModelCredentials

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
			streamUsage: false,
			verbose: options?.verbose,
		}
		return new ChatDeepSeek({
			...fields,
			callbacks: [
				...this.createHandleUsageCallbacks(copilot, model, credentials, handleLLMTokens),
				this.createHandleLLMErrorCallbacks(fields, this.#logger)
			],
			metadata: {
				profile: this.getModelProfile(model, credentials),
			}
		})
	}
}
