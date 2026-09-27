import type { Bot } from './types'
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
  const result = bots
    .map((bot) => {
      const preference = sidebar.items.find((item) => item.botId === bot.id)
      const activity = activities.find((item) => item.xpertId === (bot.assistantId || bot.id))
      const unread = !!preference?.unreadAt || (activity?.unreadMessages ?? 0) > 0
      const at = Math.max(
        preference?.unreadAt ?? 0,
        Date.parse(String((unread ? activity?.latestUnreadAt : null) || activity?.latestConversationAt || '')) || 0
      )
      return {
        bot,
        preference,
        activity,
        unread,
        at,
        subtitle: activity?.latestConversationTitle?.trim() || bot.description
      }
    })
    .filter((item) => `${item.bot.name} ${item.subtitle}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  return result.sort(
    (a, b) =>
      Number(b.unread) - Number(a.unread) ||
      b.at - a.at ||
      a.bot.name.localeCompare(b.bot.name) ||
      a.bot.id.localeCompare(b.bot.id)
  )
}
export type AssistantRow = ReturnType<typeof assistantRows>[number]
