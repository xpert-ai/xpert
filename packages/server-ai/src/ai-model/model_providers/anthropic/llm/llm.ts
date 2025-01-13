import { ChatAnthropic } from '@langchain/anthropic'
import { AIModelEntity, AiModelTypeEnum, ICopilotModel, TTokenUsage } from '@metad/contracts'
import { calcTokenUsage, sumTokenUsage } from '@metad/copilot'
import { getErrorMessage } from '@metad/server-common'
import { Injectable } from '@nestjs/common'
import { ModelProvider } from '../../../ai-provider'
import { TChatModelOptions } from '../../../types/types'
import { CredentialsValidateFailedError } from '../../errors'
import { AnthropicCredentials, toCredentialKwargs } from '../types'
import { LargeLanguageModel } from '../../../llm'

@Injectable()
export class AnthropicLargeLanguageModel extends LargeLanguageModel {
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
		const credentials = modelProvider.credentials as AnthropicCredentials

		const { handleLLMTokens } = options ?? {}

		const model = copilotModel?.model || copilotModel?.referencedModel?.model
		return new ChatAnthropic({
			...toCredentialKwargs(credentials),
			model,
			streaming: copilotModel.options?.streaming ?? true,
			temperature: 0,
			maxTokens: undefined,
			maxRetries: 2,
			callbacks: [
				{
					handleLLMStart: () => {
						this.startedAt = performance.now()
					},
					handleLLMEnd: (output) => {
						const tokenUsage: TTokenUsage = output.llmOutput?.tokenUsage ?? calcTokenUsage(output)
						if (handleLLMTokens) {
							handleLLMTokens({
								copilot,
								model,
								usage: this.calcResponseUsage(model, credentials, tokenUsage.promptTokens, tokenUsage.completionTokens),
								tokenUsed: output.llmOutput?.totalTokens ?? sumTokenUsage(output)
							})
						}
					}
				}
			]
		})
	}
}
