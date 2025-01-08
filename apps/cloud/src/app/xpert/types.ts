import { IChatMessage } from '../@core/types'

export type TCopilotChatMessage = IChatMessage & {
  event?: string
  error?: string
  expanded?: boolean
}