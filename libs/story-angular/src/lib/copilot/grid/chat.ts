import { CopilotChatMessageRoleEnum, getFunctionCall } from '@xpert-ai/copilot'
import { calcEntityTypePrompt } from '@xpert-ai/core'
import { DataSettings, assignDeepOmitBlank, cloneDeep, omit, omitBlank } from '@xpert-ai/ocap-core'
import { StoryWidget, WidgetComponentType } from '@xpert-ai/story/core'
import { nanoid } from 'nanoid'
import { map, of, switchMap } from 'rxjs'
import { analyticsAnnotationCheck, editWidgetGrid } from './schema'

export function chatGridWidget(copilot, widget?: StoryWidget) {
  const { logger, copilotService, prompt, entityType } = copilot

  const systemPrompt = `You are a BI analysis expert, please edit or create the grid widget configuration based on the cube information and the question.
One dimension can only be used once. one hierarchy can't appears in more than one independent axis.
The cube is ${calcEntityTypePrompt(entityType)}.
Original widget is ${JSON.stringify(widget ?? 'empty')}`

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
        ...editWidgetGrid,
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

export function editGridWidgetCommand(copilot) {
  const { logger, storyService } = copilot

  const widget = storyService.currentWidget()
  const page = storyService.currentPage()

  logger?.debug(`Original grid widget is`, widget, page)

  const widgetKey = widget?.key
  const pageKey = page?.key

  return chatGridWidget(copilot, widget).pipe(
    switchMap((copilot: any) => {
      const { response, entityType, dataSource } = copilot
      const { arguments: anwser } = response

      logger?.debug(`Edit grid widget anwser is`, anwser)

      if (widgetKey) {
        storyService.updateWidget({
          pageKey,
          widgetKey,
          widget: {
            ...omit(anwser, 'analytics'),
            dataSettings: assignDeepOmitBlank(
              cloneDeep(widget.dataSettings),
              {
                ...(anwser.dataSettings ?? {}),
                analytics: analyticsAnnotationCheck(anwser.analytics, entityType)
              },
              5
            )
          }
        })
      } else {
        storyService.createStoryWidget({
          component: WidgetComponentType.AnalyticalGrid,
          title: anwser.title,
          position: anwser.position,
          dataSettings: {
            dataSource,
            entitySet: entityType.name,
            analytics: analyticsAnnotationCheck(anwser.analytics, entityType)
          } as DataSettings,
          options: anwser.options
        })
      }

      return of(copilot)
    })
  )
}
