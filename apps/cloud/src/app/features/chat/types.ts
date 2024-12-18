import { IChatMessage, XpertTypeEnum } from '../../@core/types'

export const COMMON_COPILOT_ROLE = {
  slug: null,
  id: null,
  name: 'common',
  title: 'Common',
  titleCN: '通用',
  description: '通用角色',
  type: XpertTypeEnum.Agent
}


export type TCopilotChatMessage = IChatMessage & {
  event?: string
  error?: string
  expanded?: boolean
}