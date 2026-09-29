import type { I18nObject } from '../types'
import type { TWorkflowTriggerMeta } from './xpert-workflow.model'
import type { JsonSchemaObjectType } from './types'

export type AssistantTriggerCategory = 'channel' | 'automation'
export type AssistantAutomationKind = 'schedule' | 'app-event' | 'webhook' | 'email'

/** Provider-owned UI mapping; field names refer to the existing Trigger config schema. */
export interface AssistantTriggerPresentation {
  category: AssistantTriggerCategory
  channel?: string
  kind?: AssistantAutomationKind
  accountFields?: string[]
  instructionField?: string
}

export type AssistantTriggerValue =
  | string
  | number
  | boolean
  | null
  | AssistantTriggerValue[]
  | { [key: string]: AssistantTriggerValue }
export type AssistantTriggerConfig = { [key: string]: AssistantTriggerValue }
export interface AssistantTriggerProvider {
  name: string
  label: I18nObject
  presentation?: AssistantTriggerPresentation
  schema: JsonSchemaObjectType
  quickConnect?: TWorkflowTriggerMeta['quickConnect']
  available: boolean
}
export interface AssistantTriggerItem {
  key: string
  provider: string
  title: string
  enabled: boolean
  config: AssistantTriggerConfig
  lastActivityAt: string | null
  lastRunAt: string | null
  connection: 'connected' | 'disconnected' | 'connecting' | 'failed' | 'unknown'
}
export interface AssistantTriggerSettings {
  revision: string
  canEdit: boolean
  providers: AssistantTriggerProvider[]
  items: AssistantTriggerItem[]
}
export type AssistantTriggerMutation = {
  revision: string
  provider: string
} & (
  | { operation: 'save'; title: string; config: AssistantTriggerConfig }
  | { operation: 'toggle'; enabled: boolean }
  | { operation: 'delete' }
)
