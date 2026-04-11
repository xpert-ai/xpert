import { StateGraphArgs } from '@langchain/langgraph/web'
import { Team } from '@xpert-ai/copilot'

export const STORY_COMMAND_NAME = 'story'

export interface StoryAgentState extends Team.State {
  story: string
}

export const storyAgentState: StateGraphArgs<StoryAgentState>['channels'] = {
  ...Team.createState(),
  story: {
    value: (x: string, y?: string) => y ?? x,
    default: () => null
  },
}
