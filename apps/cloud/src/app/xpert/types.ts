import { IChatMessage, IXpertAgentExecution } from '../@core/types'

export type TCopilotChatMessage = IChatMessage & {
  event?: string
  error?: string
  expanded?: boolean
  executions?: IXpertAgentExecution[]
}