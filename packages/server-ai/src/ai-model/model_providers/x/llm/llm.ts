import { ChatXAI } from '@langchain/xai'
import { AiModelTypeEnum, ICopilotModel, TTokenUsage } from '@metad/contracts'
import { calcTokenUsage, sumTokenUsage } from '@metad/copilot'
import { getErrorMessage } from '@metad/server-common'
import { Injectable } from '@nestjs/common'
import { ModelProvider } from '../../../ai-provider'
import { TChatModelOptions } from '../../../types/types'
import { CredentialsValidateFailedError } from '../../errors'
import { XAICredentials, toCredentialKwargs } from '../types'
import { LargeLanguageModel } from '../../../llm'
import { ChatOpenAI } from '@langchain/openai'

@Injectable()
export class XAILargeLanguageModel extends LargeLanguageModel {
	constructor(readonly modelProvider: ModelProvider) {
		super(modelProvider, AiModelTypeEnum.LLM)
	}

	async validateCredentials(model: string, credentials: XAICredentials): Promise<void> {
		const params = toCredentialKwargs(credentials)

		const chatModel = new ChatOpenAI({
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
		const credentials = modelProvider.credentials as XAICredentials
		const params = toCredentialKwargs(credentials)

		const model = copilotModel.model
		const { handleLLMTokens } = options ?? {}
		return new ChatOpenAI({
			...params,
			model,
			streaming: copilotModel.options?.streaming ?? true,
			temperature: copilotModel.options?.temperature ?? 0,
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
		} as any)
	}
}
