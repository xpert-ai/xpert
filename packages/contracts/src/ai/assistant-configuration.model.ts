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
  instructions: string
}

export interface AssistantConfiguration {
  revision: string
  workspace: { id: string; name: string }
  prompt: string
  modelId: string
  capabilities: string[]
  setup: XpertTemplateSetup
}

export interface AssistantConfigurationInput {
  revision: string
  prompt: string
  modelId: string
  capabilities: string[]
}
