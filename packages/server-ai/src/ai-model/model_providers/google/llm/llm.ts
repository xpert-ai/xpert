import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { Injectable } from '@nestjs/common'
import { ModelProvider } from '../../../ai-provider'
import { TChatModelOptions } from '../../../types/types'
import { CredentialsValidateFailedError } from '../../errors'
import { GoogleCredentials, toCredentialKwargs } from '../types'
import { LargeLanguageModel } from '../../../llm'

@Injectable()
export class GoogleLargeLanguageModel extends LargeLanguageModel {
	constructor(readonly modelProvider: ModelProvider) {
		super(modelProvider, AiModelTypeEnum.LLM)
	}

	async validateCredentials(model: string, credentials: GoogleCredentials): Promise<void> {
		const params = toCredentialKwargs(credentials)
		const chatModel = new ChatGoogleGenerativeAI({
			...params,
			model,
			maxOutputTokens: 5
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
		const { handleLLMTokens } = options ?? {}
		const { modelProvider } = copilot
		const credentials = modelProvider.credentials as GoogleCredentials
		const params = toCredentialKwargs(credentials)
		const model = copilotModel.model
		return new ChatGoogleGenerativeAI({
			...params,
			model,
			streaming: copilotModel.options?.streaming ?? true,
			temperature: copilotModel.options?.temperature ?? 0,
			maxOutputTokens: copilotModel.options?.max_output_tokens,
			callbacks: [
				...this.createHandleUsageCallbacks(
					copilot,
					model,
					credentials,
					handleLLMTokens
				)
				// {
				// 	handleLLMEnd(output) {
				// 		if (handleLLMTokens) {
				// 			let totalTokens = output.llmOutput?.totalTokens ?? output.llmOutput?.tokenUsage?.totalTokens
				// 			if (isNaN(totalTokens)) {
				// 				totalTokens = sumTokenUsage(output)
				// 			}
				// 			handleLLMTokens({
				// 				copilot,
				// 				tokenUsed: isNaN(totalTokens) ? 0 : (totalTokens ?? 0)
				// 			})
				// 		}
				// 	},
				// }
			]
		})
	}
}
