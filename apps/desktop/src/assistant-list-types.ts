import type { IChatConversationUnreadXpertSummary } from '@xpert-ai/contracts'

export type BotActivity = IChatConversationUnreadXpertSummary
export interface SidebarPreference {
  botId: string
  pinnedAt?: number | null
  unreadAt?: number | null
  profile?: { name: string; description: string }
  sectionId?: string | null
}
export interface SidebarState {
  width: number
  collapsed: boolean
  copies: { id: string; assistantId: string }[]
  sections: { id: string; name: string }[]
  items: SidebarPreference[]
}
export type SidebarUpdate =
  | { action: 'layout'; width: number; collapsed: boolean }
  | { action: 'pin'; botId: string; pinned: boolean }
  | { action: 'unread'; botId: string; unread: boolean }
  | { action: 'move'; botId: string; sectionId: string | null }
  | { action: 'section'; name: string; botId?: string }
export interface ConversationNotice {
  botId: string
  threadId: string | null
  revision: number
}
