import { HumanMessage } from '@langchain/core/messages'
import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts'
import { Injectable, Logger } from '@nestjs/common'
import { isNil, omitBy } from 'lodash'
import { ModelProvider } from '../../../ai-provider'
import { LargeLanguageModel } from '../../../llm'
import { TChatModelOptions } from '../../../types/types'
import { toCredentialKwargs, ZhipuaiCredentials, ZhipuaiModelOptions } from '../types'
import { ChatZhipuAI, ChatZhipuAIParams } from './zhipuai'

@Injectable()
export class ZhipuAILargeLanguageModel extends LargeLanguageModel {
	readonly #logger = new Logger(ZhipuAILargeLanguageModel.name)

	constructor(readonly modelProvider: ModelProvider) {
		super(modelProvider, AiModelTypeEnum.LLM)
	}

	async validateCredentials(model: string, credentials: ZhipuaiCredentials): Promise<void> {
		const glm = new ChatZhipuAI({
			model,
			temperature: 1,
			zhipuAIApiKey: credentials.api_key
		})

		const messages = [new HumanMessage('Hello')]

		const res = await glm.invoke(messages)
	}

	override getChatModel(copilotModel: ICopilotModel, options?: TChatModelOptions) {
		const { handleLLMTokens } = options ?? {}
		const { copilot } = copilotModel
		const { modelProvider } = copilot
		const credentials = modelProvider.credentials as ZhipuaiCredentials
		const params = toCredentialKwargs(credentials)
		const modelCredentials = copilotModel.options as ZhipuaiModelOptions

		const model = copilotModel.model
		const fields = omitBy(
			{
				...params,
				model,
				streaming: modelCredentials?.streaming ?? true,
				temperature: modelCredentials?.temperature ?? 0,
				maxTokens: modelCredentials?.max_tokens,
				topP: modelCredentials?.top_p,
				frequencyPenalty: modelCredentials?.frequency_penalty,
				maxRetries: modelCredentials?.maxRetries,
				doSample: modelCredentials?.do_sample,
				thinking: modelCredentials?.thinking,
				web_search: modelCredentials?.web_search
			},
			isNil
		) as ChatZhipuAIParams
		return new ChatZhipuAI({
			...fields,
			verbose: options?.verbose,
			callbacks: [
				...this.createHandleUsageCallbacks(copilot, model, credentials, handleLLMTokens),
				this.createHandleLLMErrorCallbacks(fields, this.#logger)
			]
		})
	}
}
