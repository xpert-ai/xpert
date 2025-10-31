import { AIModelEntity, AiModelTypeEnum, FetchFrom, ICopilot, ILLMUsage, ModelPropertyKey, ParameterRule, ParameterType, PriceType, TTokenUsage } from '@metad/contracts'
import { Logger } from '@nestjs/common'
import { ChatGenerationChunk, LLMResult } from '@langchain/core/outputs'
import { AIMessage } from '@langchain/core/messages'
import { AIModel } from './ai-model'
import { CommonParameterRules, TChatModelOptions } from './types/'

export type CommonChatModelParameters = {
	temperature: number
	maxRetries?: number | null
}

export class LLMUsage implements ILLMUsage {
	/**
	 * Model class for llm usage.
	 */
	promptTokens: number
	promptUnitPrice: number
	promptPriceUnit: number
	promptPrice: number
	completionTokens: number
	completionUnitPrice: number
	completionPriceUnit: number
	completionPrice: number
	totalTokens: number
	totalPrice: number
	currency: string
	latency: number

	constructor(
		promptTokens: number,
		promptUnitPrice: number,
		promptPriceUnit: number,
		promptPrice: number,
		completionTokens: number,
		completionUnitPrice: number,
		completionPriceUnit: number,
		completionPrice: number,
		totalTokens: number,
		totalPrice: number,
		currency: string,
		latency: number
	) {
		this.promptTokens = promptTokens
		this.promptUnitPrice = promptUnitPrice
		this.promptPriceUnit = promptPriceUnit
		this.promptPrice = promptPrice
		this.completionTokens = completionTokens
		this.completionUnitPrice = completionUnitPrice
		this.completionPriceUnit = completionPriceUnit
		this.completionPrice = completionPrice
		this.totalTokens = totalTokens
		this.totalPrice = totalPrice
		this.currency = currency
		this.latency = latency
	}

	static emptyUsage(): LLMUsage {
		return new LLMUsage(0, 0.0, 0.0, 0.0, 0, 0.0, 0.0, 0.0, 0, 0.0, 'USD', 0.0)
	}

	plus(other: LLMUsage): LLMUsage {
		/**
		 * Add two LLMUsage instances together.
		 *
		 * @param other: Another LLMUsage instance to add
		 * @return: A new LLMUsage instance with summed values
		 */
		if (this.totalTokens === 0) {
			return other
		} else {
			return new LLMUsage(
				this.promptTokens + other.promptTokens,
				other.promptUnitPrice,
				other.promptPriceUnit,
				this.promptPrice + other.promptPrice,
				this.completionTokens + other.completionTokens,
				other.completionUnitPrice,
				other.completionPriceUnit,
				this.completionPrice + other.completionPrice,
				this.totalTokens + other.totalTokens,
				this.totalPrice + other.totalPrice,
				other.currency,
				this.latency + other.latency
			)
		}
	}

	add(other: LLMUsage): LLMUsage {
		/**
		 * Overload the + operator to add two LLMUsage instances.
		 *
		 * @param other: Another LLMUsage instance to add
		 * @return: A new LLMUsage instance with summed values
		 */
		return this.plus(other)
	}
}

export abstract class LargeLanguageModel extends AIModel {
	readonly #logger = new Logger(LargeLanguageModel.name)
	protected startedAt: DOMHighResTimeStamp

	protected override _commonParameterRules(model: string,): ParameterRule[] {
		return CommonParameterRules
	}

	protected calcResponseUsage(
		model: string,
		credentials: Record<string, any>,
		promptTokens: number,
		completionTokens: number
	): ILLMUsage {
		// Get prompt price information
		const promptPriceInfo = this.getPrice(model, credentials, PriceType.INPUT, promptTokens)

		// Get completed price information
		const completionPriceInfo = this.getPrice(model, credentials, PriceType.OUTPUT, completionTokens)

		// Conversion usage
		const usage: ILLMUsage = {
			promptTokens: promptTokens,
			promptUnitPrice: promptPriceInfo.unitPrice,
			promptPriceUnit: promptPriceInfo.unit,
			promptPrice: promptPriceInfo.totalAmount,
			completionTokens: completionTokens,
			completionUnitPrice: completionPriceInfo.unitPrice,
			completionPriceUnit: completionPriceInfo.unit,
			completionPrice: completionPriceInfo.totalAmount,
			totalTokens: promptTokens + completionTokens,
			totalPrice: promptPriceInfo.totalAmount + completionPriceInfo.totalAmount,
			currency: promptPriceInfo.currency,
			latency: performance.now() - this.startedAt
		}

		return usage
	}

	createHandleUsageCallbacks(
		copilot: ICopilot,
		model: string,
		credentials: any,
		handleLLMTokens: TChatModelOptions['handleLLMTokens']) {
		return [
			{
				handleLLMStart: () => {
					this.startedAt = performance.now()
				},
				handleLLMEnd: (output) => {
					const tokenUsage: TTokenUsage = output.llmOutput?.tokenUsage ?? output.llmOutput?.estimatedTokenUsage ?? calcTokenUsage(output)
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
	}

	createHandleLLMErrorCallbacks(fields, logger?: Logger) {
		return {
			handleLLMError: (err) => {
				(logger ?? this.#logger).error(err, err.cause?.stack ?? err.stack, `Error attemptNumber: ${err.attemptNumber}, retriesLeft: ${err.retriesLeft}, ChatDeepSeek params are:\n${JSON.stringify(fields, null, 2)}`)
			}
		}
	}

	protected override getCustomizableModelSchemaFromCredentials(
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

export function calcTokenUsage(output: LLMResult) {
  const tokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 } as TTokenUsage
  output.generations?.forEach((generation) => {
    generation.forEach((item) => {
      const message = (<ChatGenerationChunk>item).message as AIMessage
      if (message.usage_metadata) {
        tokenUsage.promptTokens += message.usage_metadata.input_tokens
        tokenUsage.completionTokens = message.usage_metadata.output_tokens
        tokenUsage.totalTokens = message.usage_metadata.total_tokens
      }
    })
  })
  return tokenUsage
}

/**
 * @deprecated use calcTokenUsage
 */
export function sumTokenUsage(output: LLMResult) {
  let tokenUsed = 0
  output.generations?.forEach((generation) => {
    generation.forEach((item) => {
      const message = (<ChatGenerationChunk>item).message as AIMessage
      if (message.usage_metadata) {
        tokenUsed += message.usage_metadata.total_tokens
      }
    })
  })
  return tokenUsed
}