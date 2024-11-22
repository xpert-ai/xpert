import { ChatOpenAI } from '@langchain/openai'
import { AIModelEntity, AiModelTypeEnum, ICopilotModel } from '@metad/contracts'
import { sumTokenUsage } from '@metad/copilot'
import { getErrorMessage } from '@metad/server-common'
import { Injectable } from '@nestjs/common'
import { ModelProvider } from '../../../ai-provider'
import { TChatModelOptions } from '../../../types/types'
import { CredentialsValidateFailedError } from '../../errors'
import { CommonOpenAI } from '../common'
import { OpenAICredentials } from '../types'

@Injectable()
export class OpenAILargeLanguageModel extends CommonOpenAI {
	constructor(readonly modelProvider: ModelProvider) {
		super(modelProvider, AiModelTypeEnum.LLM)
	}

	async validateCredentials(model: string, credentials: OpenAICredentials): Promise<void> {
		const params = this.toCredentialKwargs(credentials)

		const chatModel = new ChatOpenAI(params)
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

	protected getCustomizableModelSchemaFromCredentials(
		model: string,
		credentials: Record<string, any>
	): AIModelEntity | null {
		throw new Error('Method not implemented.')
	}

	override getChatModel(copilotModel: ICopilotModel, options?: TChatModelOptions) {
		const { copilot } = copilotModel
		const { modelProvider } = copilot
		const params = this.toCredentialKwargs(modelProvider.credentials as OpenAICredentials)

		const { handleLLMTokens } = options ?? {}
		return new ChatOpenAI({
			...params,
			model: copilotModel.model || copilot.defaultModel,
			streaming: copilotModel.options?.streaming ?? true,
			temperature: copilotModel.options?.temperature ?? 0,
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
