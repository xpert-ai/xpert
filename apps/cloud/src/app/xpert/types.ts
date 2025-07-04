import { format } from 'date-fns/format'
import { isToday } from 'date-fns/isToday'
import { isWithinInterval } from 'date-fns/isWithinInterval'
import { isYesterday } from 'date-fns/isYesterday'
import { subDays } from 'date-fns/subDays'
import { IChatConversation, IChatMessage, IXpertAgentExecution } from '../@core/types'

export type TCopilotChatMessage = IChatMessage & {
  /**
   * Events generated during the process are not stored
   */
  // event?: {
  //   name: string
  //   message: string
  // }
  error?: string
  expanded?: boolean
  executions?: IXpertAgentExecution[]
}


export function groupConversations(conversations: IChatConversation[]) {
  // 定义分组时间段
  const startOfToday = new Date()
  const startOfLast7Days = subDays(startOfToday, 7)
  const startOfLast30Days = subDays(startOfToday, 30)
  const groups: { name: string; values: IChatConversation[] }[] = []
  let currentGroup: (typeof groups)[0] = null
  conversations.forEach((item) => {
    const recordDate = new Date(item.updatedAt)
    let name = ''
    if (isToday(recordDate)) {
      name = 'Today'
    } else if (isYesterday(recordDate)) {
      name = 'Yesterday'
    } else if (isWithinInterval(recordDate, { start: startOfLast7Days, end: startOfToday })) {
      name = 'Last7Days'
    } else if (isWithinInterval(recordDate, { start: startOfLast30Days, end: startOfLast7Days })) {
      name = 'Last30Days'
    } else {
      // 按月份分组
      const monthKey = format(recordDate, 'yyyy-MM') //{locale: eoLocale});
      name = monthKey
    }

    if (name !== currentGroup?.name) {
      currentGroup = {
        name,
        values: [item]
      }
      groups.push(currentGroup)
    } else {
      currentGroup.values.push(item)
    }
  })

  return groups
}