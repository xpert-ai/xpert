import {
  AIModelEntity,
  AiModelTypeEnum,
  FetchFrom,
  ICopilot,
  ILLMUsage,
  LLMPriceContext,
  LLMReportedPrice,
  ModelPropertyKey,
  ParameterRule,
  ParameterType,
  PriceType,
  TTokenUsage
} from '@xpert-ai/contracts'
import { Logger } from '@nestjs/common'
import { BaseCallbackHandler } from '@langchain/core/callbacks/base'
import { ChatGenerationChunk, LLMResult } from '@langchain/core/outputs'
import { AIMessage, isAIMessageChunk } from '@langchain/core/messages'
import { AIModel } from './ai-model'
import { calculateLLMUsagePrice, isModelUsagePricingConfig } from './pricing'
import { CommonParameterRules, TChatModelOptions, TLLMUsage, TModelUsageType } from './types/'

export type CommonChatModelParameters = {
  temperature: number
  maxRetries?: number | null
}

export type LLMUsagePricingOptions = {
  context?: LLMPriceContext
  resolveContext?: (output: LLMResult) => LLMPriceContext
  resolveReportedPrice?: (output: LLMResult) => LLMReportedPrice | undefined
  reportedPriceRequired?: boolean
}

export type LLMUsagePricingConfiguration = LLMPriceContext | LLMUsagePricingOptions

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

  protected override _commonParameterRules(model: string): ParameterRule[] {
    return CommonParameterRules
  }

  protected calcResponseUsage(
    model: string,
    credentials: Record<string, any>,
    promptTokens: number,
    completionTokens: number,
    startedAt = this.startedAt,
    tokenUsage?: TTokenUsage,
    pricingContext: LLMPriceContext = {}
  ): ILLMUsage {
    const resolvedTokenUsage = tokenUsage ?? {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens
    }
    const pricing = this.getModelSchema(model, credentials)?.pricing
    if (pricing && !isModelUsagePricingConfig(pricing)) {
      const calculation = calculateLLMUsagePrice(pricing, resolvedTokenUsage, pricingContext)
      const promptBreakdown = calculation.breakdown.filter((item) =>
        ['input', 'cache_read_input', 'cache_write_input'].includes(item.component)
      )
      const completionBreakdown = calculation.breakdown.filter((item) => item.component === 'output')
      const promptRate = promptBreakdown.find((item) => item.component === 'input') ?? promptBreakdown[0]
      const completionRate = completionBreakdown[0]
      return {
        promptTokens,
        promptUnitPrice: promptRate?.unitPrice ?? 0,
        promptPriceUnit: promptRate?.unit ?? 0,
        promptPrice: Number(promptBreakdown.reduce((total, item) => total + (item.amount ?? 0), 0).toFixed(7)),
        completionTokens,
        completionUnitPrice: completionRate?.unitPrice ?? 0,
        completionPriceUnit: completionRate?.unit ?? 0,
        completionPrice: Number(completionBreakdown.reduce((total, item) => total + (item.amount ?? 0), 0).toFixed(7)),
        totalTokens: resolvedTokenUsage.totalTokens,
        totalPrice: calculation.totalAmount,
        currency: calculation.currency,
        latency: performance.now() - startedAt,
        ...(resolvedTokenUsage.cacheReadInputTokens
          ? { cacheReadInputTokens: resolvedTokenUsage.cacheReadInputTokens }
          : {}),
        ...(resolvedTokenUsage.cacheWriteInputTokens
          ? { cacheWriteInputTokens: resolvedTokenUsage.cacheWriteInputTokens }
          : {}),
        pricingStatus: calculation.pricingStatus,
        priceAuthority: 'catalog',
        pricingBreakdown: calculation.breakdown
      }
    }

    const promptPriceInfo = this.getPrice(model, credentials, PriceType.INPUT, promptTokens, promptTokens)
    const completionPriceInfo = this.getPrice(model, credentials, PriceType.OUTPUT, completionTokens, promptTokens)
    const totalPrice = Number((promptPriceInfo.totalAmount + completionPriceInfo.totalAmount).toFixed(7))

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
      totalPrice,
      currency: promptPriceInfo.currency,
      latency: performance.now() - startedAt,
      pricingStatus: totalPrice === 0 ? 'free' : 'priced',
      priceAuthority: 'catalog'
    }

    return usage
  }

  createHandleUsageCallbacks(
    copilot: ICopilot,
    model: string,
    credentials: any,
    handleLLMTokens: TChatModelOptions['handleLLMTokens'],
    pricingConfiguration: LLMUsagePricingConfiguration = {}
  ) {
    const pricingOptions = normalizeUsagePricingOptions(pricingConfiguration)
    const basePricingContext = pricingOptions.context ?? {}
    const runs = new Map<
      string,
      { startedAt: DOMHighResTimeStamp; pricingTime: Date; prompts: string[]; completion: string }
    >()
    const reportUsage = async (
      requestId: string,
      tokenUsage: TTokenUsage,
      startedAt: DOMHighResTimeStamp,
      pricingTime: Date,
      type?: TModelUsageType,
      output?: LLMResult
    ) => {
      const pricingContext = {
        ...basePricingContext,
        ...(output && pricingOptions.resolveContext ? pricingOptions.resolveContext(output) : {}),
        pricingTime
      }
      const normalizedTokenUsage = normalizeCacheTokenAccounting(tokenUsage, pricingContext)
      if (!handleLLMTokens || normalizedTokenUsage.totalTokens <= 0) {
        return
      }

      let usage: TLLMUsage = {
        ...this.calcResponseUsage(
          model,
          credentials,
          normalizedTokenUsage.promptTokens,
          normalizedTokenUsage.completionTokens,
          startedAt,
          normalizedTokenUsage,
          { ...pricingContext, inputTokensIncludeCache: true }
        ),
        ...(type ? { type } : {})
      }
      const reportedPrice = output ? pricingOptions.resolveReportedPrice?.(output) : undefined
      if (reportedPrice) {
        usage = applyProviderReportedPrice(usage, reportedPrice)
      } else if (pricingOptions.reportedPriceRequired) {
        usage = markUsagePriceUnpriced(usage, 'provider')
      }
      usage.totalTokens = normalizedTokenUsage.totalTokens
      await handleLLMTokens({
        copilot,
        model,
        requestId,
        usage,
        tokenUsed: normalizedTokenUsage.totalTokens
      })
    }
    const callback = BaseCallbackHandler.fromMethods({
      handleLLMStart: (_llm, prompts, runId) => {
        runs.set(runId, {
          startedAt: performance.now(),
          pricingTime: new Date(),
          prompts,
          completion: ''
        })
      },
      handleLLMNewToken: (token, _idx, runId, _parentRunId, _tags, fields) => {
        const run = runs.get(runId)
        if (run) {
          run.completion += token + readToolCallChunkText(fields?.chunk)
        }
      },
      handleLLMEnd: async (output, runId) => {
        const run = runs.get(runId)
        runs.delete(runId)
        const resolved = resolveTokenUsageWithAuthority(output)
        if (resolved.usage.totalTokens > 0) {
          await reportUsage(
            runId,
            resolved.usage,
            run?.startedAt ?? performance.now(),
            run?.pricingTime ?? new Date(),
            resolved.type,
            output
          )
        } else {
          await reportUsage(
            runId,
            estimateFallbackUsage(run?.prompts, run?.completion || readCompletionText(output)),
            run?.startedAt ?? performance.now(),
            run?.pricingTime ?? new Date(),
            'estimated',
            output
          )
        }
      },
      handleLLMError: async (error, runId) => {
        const run = runs.get(runId)
        runs.delete(runId)
        if (!run?.completion && !isAbortError(error)) {
          return
        }
        await reportUsage(
          runId,
          estimateFallbackUsage(run?.prompts, run?.completion),
          run?.startedAt ?? performance.now(),
          run?.pricingTime ?? new Date(),
          'estimated'
        )
      }
    })
    callback.awaitHandlers = true
    callback.raiseError = true
    return [callback]
  }

  createHandleLLMErrorCallbacks(fields, logger?: Logger) {
    return {
      handleLLMError: (err) => {
        ;(logger ?? this.#logger).error(
          err,
          err.cause?.stack ?? err.stack,
          `Error attemptNumber: ${err.attemptNumber}, retriesLeft: ${err.retriesLeft}, ChatDeepSeek params are:\n${JSON.stringify(fields, null, 2)}`
        )
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

  protected createHandleVerboseCallbacks(enabled?: boolean, logger?: Logger) {
    if (!enabled) {
      return []
    }

    const targetLogger = logger ?? this.#logger

    return [
      {
        handleChatModelStart: (llm, messages, runId, parentRunId, extraParams, tags, metadata, runName) => {
          targetLogger.verbose(
            this.formatVerboseLog('chat_model/start', {
              runId,
              parentRunId,
              runName,
              model: llm,
              messages,
              extraParams,
              tags,
              metadata
            })
          )
        },
        handleLLMStart: (llm, prompts, runId, parentRunId, extraParams, tags, metadata, runName) => {
          targetLogger.verbose(
            this.formatVerboseLog('llm/start', {
              runId,
              parentRunId,
              runName,
              model: llm,
              prompts,
              extraParams,
              tags,
              metadata
            })
          )
        },
        handleLLMEnd: (output, runId, parentRunId, tags, extraParams) => {
          targetLogger.verbose(
            this.formatVerboseLog('llm/end', {
              runId,
              parentRunId,
              output,
              tags,
              extraParams
            })
          )
        },
        handleLLMError: (err, runId, parentRunId, tags, extraParams) => {
          targetLogger.verbose(
            this.formatVerboseLog('llm/error', {
              runId,
              parentRunId,
              error: this.formatError(err),
              tags,
              extraParams
            })
          )
        }
      }
    ]
  }

  private formatVerboseLog(event: string, payload: unknown) {
    return `[langchain][${event}] ${this.stringifyLogPayload(payload)}`
  }

  private stringifyLogPayload(payload: unknown) {
    try {
      return JSON.stringify(payload, null, 2)
    } catch (error) {
      return `[unserializable payload: ${this.formatError(error)}]`
    }
  }

  private formatError(error: unknown) {
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        stack: error.stack
      }
    }

    return error
  }
}

function normalizeUsagePricingOptions(configuration: LLMUsagePricingConfiguration): LLMUsagePricingOptions {
  if (
    'context' in configuration ||
    'resolveContext' in configuration ||
    'resolveReportedPrice' in configuration ||
    'reportedPriceRequired' in configuration
  ) {
    return configuration
  }
  return { context: configuration as LLMPriceContext }
}

function applyProviderReportedPrice(usage: TLLMUsage, reportedPrice: LLMReportedPrice): TLLMUsage {
  const amount = Number(reportedPrice.amount)
  const currency = reportedPrice.currency?.trim()
  if (!Number.isFinite(amount) || amount < 0 || !currency) {
    throw new Error('Provider-reported price requires a non-negative amount and currency')
  }
  return {
    ...usage,
    totalPrice: amount,
    currency: currency.toUpperCase(),
    pricingStatus: amount === 0 ? 'free' : 'priced',
    priceAuthority: 'provider',
    pricingBreakdown: undefined
  }
}

function markUsagePriceUnpriced(usage: TLLMUsage, priceAuthority?: TLLMUsage['priceAuthority']): TLLMUsage {
  return {
    ...usage,
    totalPrice: 0,
    pricingStatus: 'unpriced',
    priceAuthority,
    pricingBreakdown: undefined
  }
}

function estimateFallbackUsage(prompts?: string[], completion?: string): TTokenUsage {
  if (!prompts) {
    return { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
  }

  const promptTokens = estimateTokens(prompts.join('\n'))
  const completionTokens = estimateTokens(completion ?? '')
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens
  }
}

function readCompletionText(output: LLMResult) {
  return output.generations
    ?.flat()
    .map((generation) => generation.text)
    .filter(Boolean)
    .join('\n')
}

function estimateTokens(text: string) {
  const estimatedText = text.replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[a-zA-Z0-9+/_=-]+/g, '[image]')
  let cjkCharacters = 0
  let otherCharacters = 0
  for (const character of estimatedText) {
    if (/\p{Script=Han}/u.test(character)) {
      cjkCharacters++
    } else {
      otherCharacters++
    }
  }
  return Math.ceil(cjkCharacters / 1.5 + otherCharacters / 4)
}

function readToolCallChunkText(chunk?: unknown) {
  if (!(chunk instanceof ChatGenerationChunk) || !isAIMessageChunk(chunk.message)) {
    return ''
  }
  return (chunk.message.tool_call_chunks ?? [])
    .map((toolCall) => `${toolCall.name ?? ''}${toolCall.args ?? ''}`)
    .join('')
}

function isAbortError(error: unknown) {
  if (!(error instanceof Error)) {
    return false
  }
  return error.name === 'AbortError' || /\babort(?:ed)?\b/i.test(error.message)
}

export function calcTokenUsage(output: LLMResult) {
  const tokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 } as TTokenUsage
  let cacheReadInputTokens = 0
  let cacheWriteInputTokens = 0
  output.generations?.forEach((generation) => {
    generation.forEach((item) => {
      const message = (<ChatGenerationChunk>item).message as AIMessage
      if (message.usage_metadata) {
        tokenUsage.promptTokens += message.usage_metadata.input_tokens
        tokenUsage.completionTokens += message.usage_metadata.output_tokens
        tokenUsage.totalTokens += message.usage_metadata.total_tokens
        cacheReadInputTokens += message.usage_metadata.input_token_details?.cache_read ?? 0
        cacheWriteInputTokens += message.usage_metadata.input_token_details?.cache_creation ?? 0
      }
    })
  })
  if (cacheReadInputTokens > 0) tokenUsage.cacheReadInputTokens = cacheReadInputTokens
  if (cacheWriteInputTokens > 0) tokenUsage.cacheWriteInputTokens = cacheWriteInputTokens
  return tokenUsage
}

export function resolveTokenUsage(output: LLMResult): TTokenUsage {
  return resolveTokenUsageWithAuthority(output).usage
}

function resolveTokenUsageWithAuthority(output: LLMResult): { usage: TTokenUsage; type?: TModelUsageType } {
  const actualUsage =
    normalizeTokenUsage(calcTokenUsage(output)) ??
    normalizeTokenUsage(output.llmOutput?.['tokenUsage']) ??
    normalizeTokenUsage({ totalTokens: output.llmOutput?.['totalTokens'] })
  if (actualUsage) {
    return { usage: actualUsage }
  }

  const estimatedUsage = normalizeTokenUsage(output.llmOutput?.['estimatedTokenUsage'])
  if (estimatedUsage) {
    return { usage: estimatedUsage, type: 'estimated' }
  }

  return {
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
  }
}

function normalizeTokenUsage(candidate?: Partial<TTokenUsage> | null): TTokenUsage | null {
  if (!candidate) {
    return null
  }

  if (
    !isValidTokenCount(candidate.promptTokens) ||
    !isValidTokenCount(candidate.completionTokens) ||
    !isValidTokenCount(candidate.totalTokens)
  ) {
    return null
  }

  const promptTokens = candidate.promptTokens ?? 0
  const completionTokens = candidate.completionTokens ?? 0
  const totalTokens = candidate.totalTokens || promptTokens + completionTokens

  if (promptTokens === 0 && completionTokens === 0 && totalTokens === 0) {
    return null
  }

  const cacheReadInputTokens = candidate.cacheReadInputTokens ?? 0
  const cacheWriteInputTokens = candidate.cacheWriteInputTokens ?? 0
  if (!isValidTokenCount(cacheReadInputTokens) || !isValidTokenCount(cacheWriteInputTokens)) {
    return null
  }

  return {
    promptTokens,
    completionTokens,
    totalTokens,
    ...(cacheReadInputTokens > 0 ? { cacheReadInputTokens } : {}),
    ...(cacheWriteInputTokens > 0 ? { cacheWriteInputTokens } : {})
  }
}

function isValidTokenCount(value?: number): boolean {
  return value === undefined || (Number.isFinite(value) && value >= 0)
}

function normalizeCacheTokenAccounting(tokenUsage: TTokenUsage, context: LLMPriceContext): TTokenUsage {
  if (context.inputTokensIncludeCache !== false) return tokenUsage
  const cacheTokens = (tokenUsage.cacheReadInputTokens ?? 0) + (tokenUsage.cacheWriteInputTokens ?? 0)
  if (!cacheTokens) return tokenUsage
  return {
    ...tokenUsage,
    promptTokens: tokenUsage.promptTokens + cacheTokens,
    totalTokens: tokenUsage.totalTokens + cacheTokens
  }
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
