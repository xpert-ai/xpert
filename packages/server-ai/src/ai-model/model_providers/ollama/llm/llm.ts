import { ChatOllama } from '@langchain/ollama'
import {
	AIModelEntity,
	AiModelTypeEnum,
	FetchFrom,
	ICopilotModel,
	ModelPropertyKey,
	ParameterType
} from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { Injectable } from '@nestjs/common'
import { ModelProvider } from '../../../ai-provider'
import { TChatModelOptions } from '../../../types/types'
import { CredentialsValidateFailedError } from '../../errors'
import { OllamaCredentials, OllamaModelCredentials } from '../types'
import { LargeLanguageModel } from '../../../llm'

@Injectable()
export class OllamaLargeLanguageModel extends LargeLanguageModel {
	constructor(readonly modelProvider: ModelProvider) {
		super(modelProvider, AiModelTypeEnum.LLM)
	}

	async validateCredentials(model: string, credentials: OllamaCredentials): Promise<void> {
		const chatModel = new ChatOllama({
			baseUrl: credentials.base_url,
			model: model,
			temperature: 0,
			maxRetries: 2,
			streaming: true
			// other params...
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
		const modelProperties = options.modelProperties as OllamaCredentials
		const model = copilotModel.model

		const modelCredentials = copilotModel.options as OllamaModelCredentials
		return new ChatOllama({
			baseUrl: copilot.modelProvider.credentials?.base_url,
			model,
			streaming: modelCredentials?.streaming ?? true,
			temperature: modelCredentials?.temperature ?? 0,
			maxRetries: modelCredentials?.maxRetries,
			callbacks: [
				...this.createHandleUsageCallbacks(
					copilot,
					model,
					modelProperties,
					handleLLMTokens
				)
				// {
				// 	handleLLMEnd(output) {
				// 		if (handleLLMTokens) {
				// 			handleLLMTokens({
				// 				copilot,
				// 				tokenUsed: output.llmOutput?.totalTokens ?? sumTokenUsage(output)
				// 			})
				// 		}
				// 	}
				// }
			]
		})
	}

	protected getCustomizableModelSchemaFromCredentials(
		model: string,
		credentials: Record<string, any>
	): AIModelEntity | null {
		return {
			model,
			label: {
				zh_Hans: model,
				en_US: model
			},
			model_type: AiModelTypeEnum.LLM,
			fetch_from: FetchFrom.CUSTOMIZABLE_MODEL,
			model_properties: {
				[ModelPropertyKey.MODE]: credentials[ModelPropertyKey.MODE],
				[ModelPropertyKey.CONTEXT_SIZE]: parseInt(credentials[ModelPropertyKey.CONTEXT_SIZE] ?? 4096)
			},
			parameter_rules: [
				{
					name: 'streaming',
					type: ParameterType.BOOLEAN,
					label: {
						zh_Hans: '是否流式传输结果',
						en_US: 'Whether to stream the results or not'
					},
					default: true
				},
				{
					name: 'temperature',
					type: ParameterType.FLOAT,
					label: {
						zh_Hans: '取样温度',
						en_US: 'Sampling temperature'
					},
					min: 0,
					max: 2
				}
			],
			pricing: {
				input: credentials['input_price'] ?? 0,
				output: credentials['output_price'] ?? 0,
				unit: credentials['unit'] ?? 0,
				currency: credentials['currency'] ?? 'USD'
			}
		}
	}
}
