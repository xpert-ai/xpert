import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts'
import { sumTokenUsage } from '@metad/copilot'
import { getErrorMessage } from '@metad/server-common'
import { Injectable } from '@nestjs/common'
import { AIModel } from '../../../ai-model'
import { ModelProvider } from '../../../ai-provider'
import { TChatModelOptions } from '../../../types/types'
import { CredentialsValidateFailedError } from '../../errors'
import { GoogleCredentials, toCredentialKwargs } from '../types'

@Injectable()
export class GoogleLargeLanguageModel extends AIModel {
	constructor(readonly modelProvider: ModelProvider) {
		super(modelProvider, AiModelTypeEnum.LLM)
	}

	async validateCredentials(model: string, credentials: GoogleCredentials): Promise<void> {
		const params = toCredentialKwargs(credentials)
		const chatModel = new ChatGoogleGenerativeAI({
			...params,
			model
		})

		try {
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
		const { copilot } = copilotModel
		const { modelProvider } = copilot
		const params = toCredentialKwargs(modelProvider.credentials as GoogleCredentials)

		const { handleLLMTokens } = options ?? {}
		return new ChatGoogleGenerativeAI({
			...params,
			model: copilotModel.model,
			streaming: copilotModel.options?.streaming ?? true,
			temperature: copilotModel.options?.temperature ?? 0,
			maxOutputTokens: copilotModel.options?.max_output_tokens,
			callbacks: [
				{
					handleLLMEnd(output) {
						if (handleLLMTokens) {
							let totalTokens = output.llmOutput?.totalTokens ?? output.llmOutput?.tokenUsage?.totalTokens
							if (isNaN(totalTokens)) {
								totalTokens = sumTokenUsage(output)
							}
							handleLLMTokens({
								copilot,
								tokenUsed: isNaN(totalTokens) ? 0 : (totalTokens ?? 0)
							})
						}
					},
				}
			]
		})
	}
}
