import { StateGraphArgs } from '@langchain/langgraph/web'
import { AgentState, createCopilotAgentState } from '@xpert-ai/copilot'

export interface WidgetAgentState extends AgentState {
  tool_call_id: string
}

export const widgetAgentState: StateGraphArgs<WidgetAgentState>['channels'] = {
  ...createCopilotAgentState(),
  tool_call_id: {
    value: (x: string, y?: string) => y,
    default: () => null
  }
}
