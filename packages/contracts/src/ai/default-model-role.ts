import { z } from 'zod'
import { AiModelTypeEnum } from '../agent/ai-model'

/** A default assignment's purpose, independent of connection identity and model type. */
export const DefaultModelRole = {
  Primary: 'primary',
  Secondary: 'secondary',
  Reasoning: 'reasoning',
  Embedding: 'embedding',
  Realtime: 'realtime',
  TextToSpeech: 'tts',
  SpeechToText: 'speech2text',
  ImageGeneration: 'image',
  VideoGeneration: 'video',
  Rerank: 'rerank',
  Moderation: 'moderation'
} as const
export const defaultModelRoleSchema = z.nativeEnum(DefaultModelRole)
export type DefaultModelRole = z.output<typeof defaultModelRoleSchema>
export const legacyProviderRoleSchema = z.enum(['primary', 'secondary', 'reasoning', 'embedding'])
export type LegacyProviderRole = z.output<typeof legacyProviderRoleSchema>

export interface DefaultModelDefinition {
  role: DefaultModelRole
  modelType: AiModelTypeEnum
  group: 'roles' | 'types'
  /** Only the compatibility adapter may use this legacy connection field. */
  legacyRole?: LegacyProviderRole
}
export const DEFAULT_MODEL_DEFINITIONS: readonly DefaultModelDefinition[] = [
  { role: DefaultModelRole.Primary, modelType: AiModelTypeEnum.LLM, group: 'roles', legacyRole: 'primary' },
  { role: DefaultModelRole.Secondary, modelType: AiModelTypeEnum.LLM, group: 'roles', legacyRole: 'secondary' },
  { role: DefaultModelRole.Reasoning, modelType: AiModelTypeEnum.LLM, group: 'roles', legacyRole: 'reasoning' },
  {
    role: DefaultModelRole.Embedding,
    modelType: AiModelTypeEnum.TEXT_EMBEDDING,
    group: 'roles',
    legacyRole: 'embedding'
  },
  { role: DefaultModelRole.Realtime, modelType: AiModelTypeEnum.REALTIME, group: 'types' },
  { role: DefaultModelRole.TextToSpeech, modelType: AiModelTypeEnum.TTS, group: 'types' },
  { role: DefaultModelRole.SpeechToText, modelType: AiModelTypeEnum.SPEECH2TEXT, group: 'types' },
  { role: DefaultModelRole.ImageGeneration, modelType: AiModelTypeEnum.IMAGE, group: 'types' },
  { role: DefaultModelRole.VideoGeneration, modelType: AiModelTypeEnum.VIDEO, group: 'types' },
  { role: DefaultModelRole.Rerank, modelType: AiModelTypeEnum.RERANK, group: 'types' },
  { role: DefaultModelRole.Moderation, modelType: AiModelTypeEnum.MODERATION, group: 'types' }
]
export function defaultModelDefinition(role: DefaultModelRole): DefaultModelDefinition {
  return DEFAULT_MODEL_DEFINITIONS.find((item) => item.role === role)!
}
