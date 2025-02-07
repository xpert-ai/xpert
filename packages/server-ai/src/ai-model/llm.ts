import { ICopilot, ILLMUsage, PriceType, TTokenUsage } from '@metad/contracts'
import { Logger } from '@nestjs/common'
import { AIModel } from './ai-model'
import { calcTokenUsage, sumTokenUsage } from '@metad/copilot'
import { TChatModelOptions } from './types/types'

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

	protected calcResponseUsage(
		model: string,
		credentials: Record<string, any>,
		promptTokens: number,
		completionTokens: number
	): ILLMUsage {
		// 获取提示价格信息
		const promptPriceInfo = this.getPrice(model, credentials, PriceType.INPUT, promptTokens)

		// 获取完成价格信息
		const completionPriceInfo = this.getPrice(model, credentials, PriceType.OUTPUT, completionTokens)

		// 转换使用情况
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
	}

	createHandleLLMErrorCallbacks(fields, logger?: Logger) {
		return {
			handleLLMError: (err) => {
				(logger ?? this.#logger).error(err, err.cause?.stack ?? err.stack, `Error attemptNumber: ${err.attemptNumber}, retriesLeft: ${err.retriesLeft}, ChatDeepSeek params are:\n${JSON.stringify(fields, null, 2)}`)
			}
		}
	}
}
