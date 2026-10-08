import type { IXpertAgent } from './xpert-agent.model'
import type { TXpertFeatures, TXpertTeamConnection, TXpertTeamNode } from './xpert.model'
import type { XpertTemplateSetup } from './xpert-template.model'

/** Tracks only capability-owned changes so editing does not replace a user's workflow. */
export interface AssistantCapabilityState {
  version: 1
  selected: string[]
  nodes: { key: string; before?: TXpertTeamNode; after: TXpertTeamNode }[]
  connections: { key: string; before?: TXpertTeamConnection; after: TXpertTeamConnection }[]
  agentKey: string
  agentOptions?: {
    before?: Pick<IXpertAgent['options'], 'middlewares' | 'parallelToolCalls'>
    after?: Pick<IXpertAgent['options'], 'middlewares' | 'parallelToolCalls'>
  }
  sandbox?: { before?: TXpertFeatures['sandbox']; after?: TXpertFeatures['sandbox'] }
  realtimeVoice?: { before?: TXpertFeatures['realtimeVoice']; after?: TXpertFeatures['realtimeVoice'] }
  instructions: string
}

export interface AssistantConfiguration {
  realtimeVoice?: import('./realtime-voice.model').RealtimeVoiceSelection
  revision: string
  workspace: { id: string; name: string }
  prompt: string
  modelId: string
  capabilities: string[]
  setup: XpertTemplateSetup
}

export interface AssistantConfigurationInput {
  realtimeVoice?: import('./realtime-voice.model').RealtimeVoiceSelection
  revision: string
  prompt: string
  modelId: string
  capabilities: string[]
}

/** Capability authoring in an existing Assistant draft; publication remains an explicit action. */
export interface AssistantCapabilityConfiguration {
  realtimeVoice?: import('./realtime-voice.model').RealtimeVoiceSelection
  revision: string
  selected: string[]
  options: {
    key: string
    label: string
    description: string
    required: boolean
    available: boolean
    reason?: string
  }[]
  setup: XpertTemplateSetup
  modelId: string
  /** Null when runtime checks prevent model validation. */
  modelAvailable: boolean | null
}

export interface AssistantCapabilityDraftInput {
  realtimeVoice?: import('./realtime-voice.model').RealtimeVoiceSelection
  revision: string
  capabilities: string[]
  /** Applied after removing managed contributions; empty selects the platform default. */
  sandboxProvider?: string
}
