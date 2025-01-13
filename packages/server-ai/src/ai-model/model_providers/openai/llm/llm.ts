import { HumanMessage, isSystemMessage } from '@langchain/core/messages'
import { ChatOpenAI } from '@langchain/openai'
import { AIModelEntity, AiModelTypeEnum, ICopilotModel, TTokenUsage } from '@metad/contracts'
import { calcTokenUsage, sumTokenUsage } from '@metad/copilot'
import { getErrorMessage } from '@metad/server-common'
import { Injectable } from '@nestjs/common'
import { ModelProvider } from '../../../ai-provider'
import { TChatModelOptions } from '../../../types/types'
import { CredentialsValidateFailedError } from '../../errors'
import { CommonOpenAI } from '../common'
import { OpenAICredentials } from '../types'

class ValidatedChatOpenAI extends ChatOpenAI {
	async invoke(messages, options?: any): Promise<any> {
		if (this.model?.startsWith('o')) {
			this.streaming = false
			messages.forEach((message, index: number) => {
				if (isSystemMessage(message)) {
					messages[index] = new HumanMessage(message)
				}
			})
		}

		return super.invoke(messages, options)
	}
}

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
		const credentials = modelProvider.credentials as OpenAICredentials
		const params = this.toCredentialKwargs(credentials)

		const model = copilotModel.model
		const { handleLLMTokens } = options ?? {}
		return new ValidatedChatOpenAI({
			...params,
			model,
			streaming: copilotModel.options?.streaming ?? true,
			temperature: copilotModel.options?.temperature ?? 0,
			maxTokens: copilotModel.options?.max_tokens,
			streamUsage: false,
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
