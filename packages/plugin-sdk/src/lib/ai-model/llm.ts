import {
  AIModelEntity,
  AiModelTypeEnum,
  FetchFrom,
  ICopilot,
  ILLMUsage,
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
import { CommonParameterRules, TChatModelOptions, TLLMUsage, TModelUsageType } from './types/'

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

  protected override _commonParameterRules(model: string): ParameterRule[] {
    return CommonParameterRules
  }

  protected calcResponseUsage(
    model: string,
    credentials: Record<string, any>,
    promptTokens: number,
    completionTokens: number,
    startedAt = this.startedAt
  ): ILLMUsage {
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
      latency: performance.now() - startedAt
    }

    return usage
  }

  createHandleUsageCallbacks(
    copilot: ICopilot,
    model: string,
    credentials: any,
    handleLLMTokens: TChatModelOptions['handleLLMTokens']
  ) {
    const runs = new Map<string, { startedAt: DOMHighResTimeStamp; prompts: string[]; completion: string }>()
    const reportUsage = async (tokenUsage: TTokenUsage, startedAt: DOMHighResTimeStamp, type?: TModelUsageType) => {
      if (!handleLLMTokens || tokenUsage.totalTokens <= 0) {
        return
      }

      const usage: TLLMUsage = {
        ...this.calcResponseUsage(model, credentials, tokenUsage.promptTokens, tokenUsage.completionTokens, startedAt),
        ...(type ? { type } : {})
      }
      usage.totalTokens = tokenUsage.totalTokens
      await handleLLMTokens({
        copilot,
        model,
        usage,
        tokenUsed: tokenUsage.totalTokens
      })
    }
    const callback = BaseCallbackHandler.fromMethods({
      handleLLMStart: (_llm, prompts, runId) => {
        runs.set(runId, {
          startedAt: performance.now(),
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
          await reportUsage(resolved.usage, run?.startedAt ?? performance.now(), resolved.type)
        } else {
          await reportUsage(
            estimateFallbackUsage(run?.prompts, run?.completion || readCompletionText(output)),
            run?.startedAt ?? performance.now(),
            'estimated'
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
          estimateFallbackUsage(run?.prompts, run?.completion),
          run?.startedAt ?? performance.now(),
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
  output.generations?.forEach((generation) => {
    generation.forEach((item) => {
      const message = (<ChatGenerationChunk>item).message as AIMessage
      if (message.usage_metadata) {
        tokenUsage.promptTokens += message.usage_metadata.input_tokens
        tokenUsage.completionTokens += message.usage_metadata.output_tokens
        tokenUsage.totalTokens += message.usage_metadata.total_tokens
      }
    })
  })
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

  return { promptTokens, completionTokens, totalTokens }
}

function isValidTokenCount(value?: number): boolean {
  return value === undefined || (Number.isFinite(value) && value >= 0)
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
