import { StateGraphArgs } from '@langchain/langgraph/web'
import { AgentState, createCopilotAgentState } from '@xpert-ai/copilot'

export const STORY_PAGE_COMMAND_NAME = 'page'

export type PageAgentState = AgentState
export const pageAgentState: StateGraphArgs<PageAgentState>['channels'] = {
  ...createCopilotAgentState()
}

export const MinCols = 20
export const MinRows = 20