import { ClientOptions, OpenAIBaseInput } from '@langchain/openai'
import { ICopilotModel } from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { Injectable } from '@nestjs/common'
import { TChatModelOptions } from '../../../types/types'
import { CredentialsValidateFailedError } from '../../errors'
import { OAIAPICompatLargeLanguageModel } from '../../openai_api_compatible/llm/llm'
import { OpenRouterAiBaseUrl, OpenRouterCredentials, OpenRouterModelCredentials } from '../types'
import { ModelProvider } from '../../../ai-provider'

@Injectable()
export class OpenRouterLargeLanguageModel extends OAIAPICompatLargeLanguageModel {

	constructor(readonly modelProvider: ModelProvider) {
		super(modelProvider)
	}

	async validateCredentials(model: string, credentials: OpenRouterModelCredentials): Promise<void> {
		const params = toCredentialKwargs(credentials, model)

		const chatModel = this.createChatModel(params)
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
		const credentials = modelProvider.credentials as OpenRouterCredentials
		const modelCredentials = options?.modelProperties as OpenRouterModelCredentials

		return super.getChatModel(copilotModel, options, {
			...credentials,
			...modelCredentials,
			endpoint_url: OpenRouterAiBaseUrl,
			api_key: modelCredentials?.api_key || credentials.api_key
		})
	}
}

function toCredentialKwargs(credentials: OpenRouterModelCredentials, model: string) {
	const credentialsKwargs: OpenAIBaseInput = {
		apiKey: credentials.api_key,
		model
	} as OpenAIBaseInput
	const configuration: ClientOptions = {}

	configuration.baseURL = OpenRouterAiBaseUrl

	return {
		...credentialsKwargs,
		configuration
	}
}
