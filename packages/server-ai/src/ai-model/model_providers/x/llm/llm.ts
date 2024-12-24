import { ChatXAI } from '@langchain/xai'
import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts'
import { sumTokenUsage } from '@metad/copilot'
import { getErrorMessage } from '@metad/server-common'
import { Injectable } from '@nestjs/common'
import { AIModel } from '../../../ai-model'
import { ModelProvider } from '../../../ai-provider'
import { TChatModelOptions } from '../../../types/types'
import { CredentialsValidateFailedError } from '../../errors'
import { XAICredentials, toCredentialKwargs } from '../types'

@Injectable()
export class XAILargeLanguageModel extends AIModel {
	constructor(readonly modelProvider: ModelProvider) {
		super(modelProvider, AiModelTypeEnum.LLM)
	}

	async validateCredentials(model: string, credentials: XAICredentials): Promise<void> {
		const params = toCredentialKwargs(credentials)

		const chatModel = new ChatXAI({
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
		const params = toCredentialKwargs(modelProvider.credentials as XAICredentials)

		const { handleLLMTokens } = options ?? {}
		return new ChatXAI({
			...params,
			model: copilotModel.model,
			streaming: copilotModel.options?.streaming ?? true,
			temperature: copilotModel.options?.temperature ?? 0,
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
					}
				}
			]
		})
	}
}
