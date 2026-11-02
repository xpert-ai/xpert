import { randomUUID } from 'node:crypto'
import { OpenAIEmbeddings } from '@langchain/openai'
import { AiModelTypeEnum } from '@xpert-ai/contracts'
import { normalizeTokenUsage } from '../token-usage'
import type { TChatModelOptions } from '../types/model'

/** OpenAI-compatible embeddings with authoritative, per-request usage callbacks. */
export class OpenAICompatibleEmbeddings extends OpenAIEmbeddings {
  constructor(
    input: ConstructorParameters<typeof OpenAIEmbeddings>[0],
    private readonly usageCallbacks?: Pick<TChatModelOptions, 'handleModelUsage' | 'resolveUsagePricingSnapshot'>
  ) {
    super(input)
  }

  protected override async embeddingWithRetry(
    request: Parameters<OpenAIEmbeddings['embeddingWithRetry']>[0]
  ): ReturnType<OpenAIEmbeddings['embeddingWithRetry']> {
    const requestId = randomUUID()
    const context = {
      model: request.model,
      modelType: AiModelTypeEnum.TEXT_EMBEDDING,
      operation: AiModelTypeEnum.TEXT_EMBEDDING,
      modality: 'text' as const,
      startedAt: new Date().toISOString()
    }
    const reportUsage = this.usageCallbacks?.handleModelUsage
    const pricingSnapshot = reportUsage ? await this.usageCallbacks?.resolveUsagePricingSnapshot?.(context) : undefined
    const response = await super.embeddingWithRetry(request)
    const usage = normalizeTokenUsage({
      promptTokens: response.usage?.prompt_tokens,
      completionTokens: 0,
      totalTokens: response.usage?.total_tokens
    })
    // Stay outside the transport retry loop: accounting failure must not repeat a billable request.
    if (usage && reportUsage) {
      await reportUsage({
        ...context,
        requestId,
        pricingSnapshot,
        recordedAt: new Date().toISOString(),
        metrics: [{ unit: 'token', authority: 'provider', ...usage }]
      })
    }
    return response
  }
}
