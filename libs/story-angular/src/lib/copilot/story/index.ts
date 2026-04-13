import { CopilotCommand } from '@xpert-ai/copilot'
import { switchMap } from 'rxjs'
import { checkDefaultEntity } from '../common'
import { createStoryPage, smartDiscover } from './chat'

export const StoryCommand = {
  name: 'story',
  description: 'New story',
  examples: ['create new story with 3 pages for sales'],
  processor: (copilot) => {
    return checkDefaultEntity(copilot).pipe(switchMap(smartDiscover), switchMap(createStoryPage))
  }
} as CopilotCommand
