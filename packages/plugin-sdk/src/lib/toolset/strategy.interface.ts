import { DynamicStructuredTool } from '@langchain/core/tools'
import { I18nObject, IconDefinition } from '@xpert-ai/contracts'
import type { ZodSchema } from 'zod/v3'
import { BuiltinToolset, TBuiltinToolsetParams } from './builtin'
import type { VideoGenerationToolsetCapability } from '../core/permissions/video-generation'

export interface IToolsetStrategy<TConfig = any> {
  /**
   * Metadata about this toolset
   */
  readonly meta: {
    author: string // author name
    tags: string[] // tags for categorization
    name: string // unique key
    label: I18nObject // i18n label
    description?: I18nObject // optional i18n description
    configSchema: any // JSON schema for config validation
    icon?: IconDefinition
    /** Optional normalized video-generation capability consumed by platform services. */
    videoGeneration?: VideoGenerationToolsetCapability
  }

  /**
   * Validate the configuration
   */
  validateConfig(config: TConfig): Promise<void>

  create(config: TConfig, params?: TBuiltinToolsetParams): Promise<BuiltinToolset>

  createTools(): DynamicStructuredTool<ZodSchema>[]
}
