import { ChatAnthropic } from '@langchain/anthropic'
import { AIModelEntity, AiModelTypeEnum, ICopilotModel } from '@metad/contracts'
import { sumTokenUsage } from '@metad/copilot'
import { getErrorMessage } from '@metad/server-common'
import { Injectable } from '@nestjs/common'
import { AIModel } from '../../../ai-model'
import { ModelProvider } from '../../../ai-provider'
import { TChatModelOptions } from '../../../types/types'
import { CredentialsValidateFailedError } from '../../errors'
import { AnthropicCredentials, toCredentialKwargs } from '../types'

@Injectable()
export class AnthropicLargeLanguageModel extends AIModel {
	constructor(readonly modelProvider: ModelProvider) {
		super(modelProvider, AiModelTypeEnum.LLM)
	}

	async validateCredentials(model: string, credentials: AnthropicCredentials): Promise<void> {
		try {
			const chatModel = new ChatAnthropic({
				...toCredentialKwargs(credentials),
				model,
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

	protected getCustomizableModelSchemaFromCredentials(
		model: string,
		credentials: Record<string, any>
	): AIModelEntity | null {
		throw new Error('Method not implemented.')
	}

	getChatModel(copilotModel: ICopilotModel, options?: TChatModelOptions) {
		const { copilot } = copilotModel
		const { modelProvider } = copilot

		const { handleLLMTokens } = options ?? {}

		const model = copilotModel?.model || copilotModel?.referencedModel?.model || copilot.defaultModel
		return new ChatAnthropic({
			...toCredentialKwargs(modelProvider.credentials as AnthropicCredentials),
			model,
			temperature: 0,
			maxTokens: undefined,
			maxRetries: 2,
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
