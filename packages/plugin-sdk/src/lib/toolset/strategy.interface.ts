import { DynamicStructuredTool } from '@langchain/core/tools'
import { I18nObject, IconDefinition } from '@metad/contracts'
import { ZodSchema } from 'zod'
import { BuiltinToolset } from './builtin'

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
  }

  /**
   * Validate the configuration
   */
  validateConfig(config: TConfig): Promise<void>

  create(config: TConfig): Promise<BuiltinToolset>

  createTools(): DynamicStructuredTool<ZodSchema>[]
}
