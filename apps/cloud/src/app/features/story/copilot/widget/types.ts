import { StateGraphArgs } from '@langchain/langgraph/web'
import { AgentState, createCopilotAgentState } from '@xpert-ai/copilot'

export const WIDGET_COMMAND_NAME = 'widget'

export interface WidgetAgentState extends AgentState {
}

export const widgetAgentState: StateGraphArgs<WidgetAgentState>['channels'] = {
  ...createCopilotAgentState(),
}
