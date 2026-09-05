import type { TAvatar } from '../types'

export const AGENT_PROFILE_TABS_SLOT = 'agent.profile.tabs'

export interface XpertAssistantProfileIndicators {
  skillCount: number | null
  toolCount: number
  subAgentCount: number
  conversationCount30d: number | null
}

/** Display-only projection. Never add prompts, credentials or runtime configuration here. */
export interface XpertAssistantProfile {
  id: string
  name: string
  title?: string | null
  titleCN?: string | null
  description?: string | null
  avatar?: TAvatar | null
  version?: string | null
  tags: { id: string; name: string; color?: string | null }[]
  workspace?: { id: string; name: string } | null
  creator?: { id: string; name: string } | null
  publishedAt?: Date | string | null
  createdAt?: Date | string | null
  updatedAt?: Date | string | null
  indicators: XpertAssistantProfileIndicators
}

/** Backend-only identity, resolved by the host; never accepted from view query/action inputs. */
export interface XpertViewAssistantIdentity {
  instanceId: string
  currentId: string
  versionIds: string[]
}
