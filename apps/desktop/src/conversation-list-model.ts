import { assistantGroups, type AssistantRow } from './assistant-list-model.ts'
import type { SidebarState } from './assistant-list-types'
import type { GroupSummary } from './groups/types'

export type ConversationRow =
  | { purpose: 'private'; assistant: AssistantRow }
  | { purpose: 'group'; group: GroupSummary }
const activityAt = (row: ConversationRow) => {
  const date =
    row.purpose === 'group'
      ? row.group.updatedAt
      : (row.assistant.activity?.latestConversationAt ?? row.assistant.bot.createdAt)
  return date ? new Date(date).getTime() || 0 : 0
}
const recentFirst = (a: ConversationRow, b: ConversationRow) => activityAt(b) - activityAt(a)

/** Groups participate in the existing pinned/default sections, never in a fixed group-chat section. */
export function conversationGroups(
  rows: AssistantRow[],
  groups: GroupSummary[],
  sidebar: SidebarState,
  query: string,
  archived = false
) {
  const sections: {
    id: string
    name: string
    kind: 'pinned' | 'section' | 'domain' | 'unassigned'
    rows: ConversationRow[]
  }[] = archived
    ? []
    : assistantGroups(rows, sidebar).map((section) => ({
        ...section,
        rows: section.rows.map((assistant) => ({ purpose: 'private', assistant }))
      }))
  for (const group of groups) {
    if (
      group.purpose !== 'group' ||
      group.archived !== archived ||
      !`${group.title} ${group.lastMessage}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())
    )
      continue
    const id = group.pinned && !archived ? 'pinned' : ''
    let section = sections.find((item) => item.id === id)
    if (!section) {
      section = { id, name: id ? 'Pinned assistants' : 'Unassigned', kind: id ? 'pinned' : 'unassigned', rows: [] }
      if (id) sections.unshift(section)
      else sections.push(section)
    }
    section.rows.push({ purpose: group.purpose, group })
  }
  return sections.map((section) => ({ ...section, rows: section.rows.sort(recentFirst) }))
}
