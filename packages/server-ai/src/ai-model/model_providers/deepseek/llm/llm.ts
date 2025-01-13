import { ChatOpenAI } from '@langchain/openai'
import { AIModelEntity, AiModelTypeEnum, ICopilotModel, TTokenUsage } from '@metad/contracts'
import { calcTokenUsage, sumTokenUsage } from '@metad/copilot'
import { getErrorMessage } from '@metad/server-common'
import { Injectable } from '@nestjs/common'
import { ModelProvider } from '../../../ai-provider'
import { TChatModelOptions } from '../../../types/types'
import { CredentialsValidateFailedError } from '../../errors'
import { DeepseekCredentials, toCredentialKwargs } from '../types'
import { LargeLanguageModel } from '../../../llm'

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

	override getChatModel(copilotModel: ICopilotModel, options?: TChatModelOptions) {
		const { copilot } = copilotModel
		const { modelProvider } = copilot
		const credentials = modelProvider.credentials as DeepseekCredentials
		const params = toCredentialKwargs(credentials)

		const model = copilotModel.model
		const { handleLLMTokens } = options ?? {}
		return new ChatOpenAI({
			...params,
			model,
			temperature: 0,
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
