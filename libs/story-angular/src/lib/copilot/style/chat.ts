import { CopilotChatMessageRoleEnum, getFunctionCall } from '@xpert-ai/copilot'
import { omitBlank } from '@xpert-ai/ocap-core'
import { of } from 'rxjs'
import { map } from 'rxjs/operators'
import { editStoryStyle } from './schema'
import { nanoid } from 'ai'

/**
 * Modify story styles: theme, watermark, colors, tab bar, page header, etc.
 *
 * @param prompt
 */
export function chatStoryStyle(copilot) {
  const { copilotService, storyService, prompt } = copilot

  const preferences = storyService.preferences()

  const systemPrompt = `You are a BI analysis expert, please modify the theme and style of the story according to the prompts. Original story preferences is ${JSON.stringify(preferences)}`

  return copilotService
    .chatCompletions(
      [
        {
          id: nanoid(),
          role: CopilotChatMessageRoleEnum.System,
          content: systemPrompt
        },
        {
          id: nanoid(),
          role: CopilotChatMessageRoleEnum.User,
          content: prompt
        }
      ],
      {
        ...editStoryStyle,
        ...omitBlank(copilot.options)
      }
    )
    .pipe(
      map(({ choices }) => {
        try {
          copilot.response = getFunctionCall(choices[0].message)
        } catch (err) {
          copilot.error = err as Error
        }
        return copilot
      })
    )
}

export function modifyStory(copilot) {
  const { response, storyService } = copilot
  const answer = response.arguments

  storyService.mergeStoryPreferences({
    ...answer,
  })
  return of(copilot)
}
