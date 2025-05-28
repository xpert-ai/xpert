import { ChatXAI } from '@langchain/xai'
import { ChatOpenAI } from '@langchain/openai'
import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { Injectable } from '@nestjs/common'
import { ModelProvider } from '../../../ai-provider'
import { TChatModelOptions } from '../../../types/types'
import { CredentialsValidateFailedError } from '../../errors'
import { XAICredentials, toCredentialKwargs } from '../types'
import { LargeLanguageModel } from '../../../llm'

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
			verbose: options?.verbose,
			callbacks: [
				...this.createHandleUsageCallbacks(copilot, model, credentials, handleLLMTokens)
			]
		} as any)
	}
}
