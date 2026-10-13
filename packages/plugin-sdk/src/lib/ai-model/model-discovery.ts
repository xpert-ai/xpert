import {
  AIModelEntity,
  AiModelTypeEnum,
  configurationFromModel,
  DiscoveredModel,
  isDiscoverableModelType
} from '@xpert-ai/contracts'
import { z } from 'zod'

const modelListSchema = z.object({
  data: z.array(
    z.object({
      id: z.string().trim().min(1).max(512),
      active: z.boolean().optional(),
      name: z.string().optional(),
      model_type: z.string().optional()
    })
  )
})

export type OpenAIModelDiscoveryOptions = {
  baseUrl: string
  authorization: string
  path?: string
  predefinedModels?: readonly AIModelEntity[]
  fetchImpl?: typeof fetch
}

/** OpenAI-compatible discovery transport and import suggestions, never runtime routing. */
export async function discoverOpenAIModels(options: OpenAIModelDiscoveryOptions): Promise<DiscoveredModel[]> {
  const response = await (options.fetchImpl ?? fetch)(
    `${options.baseUrl.replace(/\/+$/, '')}/${(options.path ?? 'models').replace(/^\/+/, '')}`,
    {
      method: 'GET',
      headers: { Authorization: options.authorization, Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000)
    }
  )
  if (!response.ok) throw new Error(`Model discovery returned HTTP ${response.status}`)
  const payload = modelListSchema.parse(await response.json())
  const models = new Map<string, DiscoveredModel>()
  for (const entry of payload.data) {
    if (entry.active === false || models.has(entry.id)) continue
    const known = options.predefinedModels?.find((model) => model.model === entry.id)
    // Explicit unsupported types must not fall through to name-based guesses.
    if (entry.model_type && !isDiscoverableModelType(entry.model_type)) continue
    if (known && !isDiscoverableModelType(known.model_type)) continue
    const modelType = entry.model_type ?? known?.model_type ?? suggestModelType(entry.id)
    const typeSource = entry.model_type ? 'provider' : known ? 'catalog' : modelType ? 'name' : 'unknown'
    const supportedType = isDiscoverableModelType(modelType) ? modelType : null
    models.set(entry.id, {
      model: entry.id,
      label: entry.name || entry.id,
      modelType: supportedType,
      typeSource,
      ...(supportedType ? { configuration: configurationFromModel(supportedType, known) } : {})
    })
  }
  return [...models.values()]
}

function suggestModelType(name: string): AiModelTypeEnum | null {
  if (/(?:rerank|reranker)/i.test(name)) return AiModelTypeEnum.RERANK
  if (/(?:embedding|embed)/i.test(name)) return AiModelTypeEnum.TEXT_EMBEDDING
  // Unknown and opaque IDs stay unclassified, including unsupported image/audio/video models.
  if (/(?:image|vision-exp|video|tts|whisper|speech|audio|wan\d|seedance|seedream)/i.test(name)) return null
  if (
    /(?:^|[\/_-])(?:gpt|qwen|deepseek|glm|kimi|llama|mistral|claude|minimax|gemini|chat|doubao)(?:[\d._/-]|$)/i.test(
      name
    )
  ) {
    return AiModelTypeEnum.LLM
  }
  return null
}

export { configurationFromModel } from '@xpert-ai/contracts'
