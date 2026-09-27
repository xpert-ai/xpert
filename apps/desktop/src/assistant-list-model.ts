import type { Bot } from './types'
// Keep the renderer independent of the contracts barrel's runtime side effects.
import { orderAssistantXperts } from '../../../packages/contracts/src/ai/assistant-order.ts'
import type { BotActivity, SidebarState } from './assistant-list-types'

export const SIDEBAR_MIN = 240
export const SIDEBAR_MAX = 520
export const SIDEBAR_COLLAPSED = 72
export function resizeSidebar(width: number, available: number) {
  return {
    collapsed: width < SIDEBAR_MIN / 2,
    width: Math.round(Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, available - 360, width)))
  }
}
export function assistantRows(bots: Bot[], sidebar: SidebarState, activities: BotActivity[], query: string) {
  return orderAssistantXperts(bots)
    .map((bot) => {
      const preference = sidebar.items.find((item) => item.botId === bot.id)
      const activity = activities.find((item) => item.xpertId === (bot.assistantId || bot.id))
      const unread = !!preference?.unreadAt || (activity?.unreadMessages ?? 0) > 0
      return {
        bot,
        preference,
        activity,
        unread,
        subtitle: activity?.latestConversationTitle?.trim() || bot.description
      }
    })
    .filter((item) => `${item.bot.name} ${item.subtitle}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
}
export type AssistantRow = ReturnType<typeof assistantRows>[number]
