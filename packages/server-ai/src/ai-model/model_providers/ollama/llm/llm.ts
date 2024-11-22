import { ChatOllama } from '@langchain/ollama'
import {
	AIModelEntity,
	AiModelTypeEnum,
	FetchFrom,
	ICopilotModel,
	ModelPropertyKey,
	ParameterType
} from '@metad/contracts'
import { sumTokenUsage } from '@metad/copilot'
import { getErrorMessage } from '@metad/server-common'
import { Injectable } from '@nestjs/common'
import { AIModel } from '../../../ai-model'
import { ModelProvider } from '../../../ai-provider'
import { TChatModelOptions } from '../../../types/types'
import { CredentialsValidateFailedError } from '../../errors'
import { OllamaCredentials } from '../types'

@Injectable()
export class OllamaLargeLanguageModel extends AIModel {
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
		const modelProperties = options.modelProperties as OllamaCredentials

		const { handleLLMTokens } = options ?? {}
		return new ChatOllama({
			baseUrl: modelProperties.base_url,
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
