import { StateGraphArgs } from '@langchain/langgraph/web'
import { Team } from '@xpert-ai/copilot'

export const STORY_STYLE_COMMAND_NAME = 'style'

export interface StoryStyleAgentState extends Team.State {
}

export const storyStyleAgentState: StateGraphArgs<StoryStyleAgentState>['channels'] = {
  ...Team.createState(),
}
