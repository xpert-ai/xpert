import { CopilotCommand } from '@xpert-ai/copilot'
import { switchMap } from 'rxjs'
import { chatStoryStyle, modifyStory } from './chat'

export const StyleCommand = {
  name: 'style',
  description: 'Edit styles of story',
  examples: ['change theme to dark'],
  processor: (copilot) => {
    return chatStoryStyle(copilot).pipe(switchMap(modifyStory))
  }
} as CopilotCommand
