import type { MembershipStatusEnum, MembershipPeriodStatusEnum, IMembershipUsageGroupKey } from '@xpert-ai/contracts'

export interface UsageMembership {
  planName: string
  description: string | null
  status: MembershipStatusEnum | null
  personalPointsOnly: boolean
  pointsGranted: number | null
  pointsUsed: number
  pointsRemaining: number | null
  personalPointsBalance: number
  currentPeriodStart: string
  currentPeriodEnd: string
  allowedModels: string[]
}
export interface UsagePeriod {
  id: string
  planName: string
  status: MembershipPeriodStatusEnum | null
  periodStart: string
  periodEnd: string
  pointsGranted: number | null
  pointsUsed: number
}
export interface UsageRank {
  key: string
  label: string
  pointsUsed: number
  tokenUsed: number
}
export interface UsageBucket {
  date: string
  pointsUsed: number
  tokenUsed: number
}
export interface UsageOverview {
  totalTokens: number
  buckets: UsageBucket[]
  topModels: UsageRank[]
  topXperts: UsageRank[]
  topThreads: UsageRank[]
}
export type UsageGroup = { [K in keyof Required<IMembershipUsageGroupKey>]: IMembershipUsageGroupKey[K] | null }
export interface UsageSummary {
  group: UsageGroup
  conversationTitle: string | null
  assistantTitle: string | null
  pointsUsed: number
  tokenUsed: number
  firstUsedAt: string | null
  lastUsedAt: string | null
}
export interface UsageEntry {
  id: string | null
  createdAt: string
  points: number
  tokenUsed: number | null
  source: string | null
}
export interface UsageQuery {
  start: string
  end: string
  model?: string
  threadId?: string
  xpertId?: string
}
export type UsageTab = 'overview' | 'analytics' | 'details'
