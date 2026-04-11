import { CopilotChatMessageRoleEnum, getFunctionCall } from '@xpert-ai/copilot'
import { calcEntityTypePrompt } from '@xpert-ai/core'
import { omitBlank, pick } from '@xpert-ai/ocap-core'
import { StoryPoint, StoryPointType, StoryWidget, WidgetComponentType, uuid } from '@xpert-ai/story/core'
import { fixDimension } from '@xpert-ai/story/story'
import { nanoid } from 'ai'
import { combineLatest, concat, of } from 'rxjs'
import { map, switchMap, tap } from 'rxjs/operators'
import { chartAnnotationCheck, editWidgetChart } from '../chart/schema'
import { editWidgetControl } from '../control'
import { analyticsAnnotationCheck, editWidgetGrid } from '../grid/schema'
import { discoverStory } from './schema'

/**
 * Create story dashboard that contains multiple story pages.
 *
 * @param prompt
 */
export function smartDiscover(copilot) {
  const { copilotService, prompt, entityType } = copilot

  const systemPrompt = `You are a BI analysis expert. Please provide several analysis theme pages that can be created based on the cube information and the question.
  Each page should have at least 4 widgets and one or more input control widgets and these widgets must fullfill the layout of page which is 10 rows and 10 columns.
Widgets should be arranged in a staggered manner.
The cube is ${calcEntityTypePrompt(entityType)}`

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
        ...discoverStory,
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

export function createStoryPage(copilot) {
  const { dataSource, storyService, response, entityType } = copilot
  const pages = response.arguments.pages

  return concat<any[]>(
    ...pages.map((page) => {
      const pageKey = uuid()
      const widgets = page.widgets?.map((widget) => {
        return {
          ...widget,
          key: uuid(),
          dataSettings: {
            dataSource,
            entitySet: entityType.name
          }
        }
      })

      return of({
        key: pageKey,
        type: StoryPointType.Canvas,
        name: page.title,
        gridOptions: {
          gridType: 'fit',
          minCols: 10,
          minRows: 10
        },
        widgets
      } as Partial<StoryPoint>).pipe(
        switchMap((page) => storyService.newStoryPage(page)),
        map((page) => ({ ...copilot, response: page })),
        switchMap(discoverPageWidgets)
      )
    })
  )
}

/**
 * Concurrently create widgets in the page
 *
 * @param copilot
 * @returns
 */
export function discoverPageWidgets(copilot) {
  const { response: page } = copilot
  return page.widgets?.length
    ? combineLatest(page.widgets.map((widget) => chatStoryWidget(copilot, widget))).pipe(map(() => copilot))
    : of(copilot)
}

/**
 * Chat with copilot to create a widget in the page
 *
 * @param copilot
 * @param widget
 * @returns
 */
export function chatStoryWidget(copilot, widget: StoryWidget) {
  const { copilotService, storyService, response: page, entityType } = copilot

  const componentType = widget.component

  const systemPrompt = `You are a BI analysis expert. Please fill in the ${componentType} component configuration based on the cube information and description.
  Dimension is composed of three attributes: dimension name, hierarchy name, and level name. The value of these three attribute names must contain the symbol '[]'.
The cube is ${calcEntityTypePrompt(entityType)}`

  let discoverWidget = null
  switch (componentType) {
    case WidgetComponentType.AnalyticalCard:
      discoverWidget = editWidgetChart
      break
    case WidgetComponentType.AnalyticalGrid:
      discoverWidget = editWidgetGrid
      break
    case WidgetComponentType.InputControl:
      discoverWidget = editWidgetControl
      break
  }

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
          content: `This widget is '${widget.title}'`
        }
      ],
      {
        ...discoverWidget,
        ...omitBlank(copilot.options)
      }
    )
    .pipe(
      map(({ choices }) => {
        try {
          return getFunctionCall(choices[0].message)
        } catch (err) {
          throw new Error('Error when parse the response of discover widget')
        }
      }),
      tap((response: any) => {
        console.log(`The widget response is`, response.arguments)

        const answer = response.arguments
        const dataSettings = {} as any

        switch (componentType) {
          case WidgetComponentType.AnalyticalCard:
            dataSettings.chartAnnotation = chartAnnotationCheck(
              {
                ...answer.chartAnnotation
              },
              entityType
            )
            break
          case WidgetComponentType.AnalyticalGrid:
            dataSettings.analytics = analyticsAnnotationCheck(
              {
                ...answer.analytics
              },
              entityType
            )
            break
          case WidgetComponentType.InputControl:
            dataSettings.dimension = fixDimension(answer.dimension, entityType)
            break
        }

        storyService.updateWidget({
          pageKey: page.key,
          widgetKey: widget.key,
          widget: {
            ...widget,
            ...pick(answer, 'options'),
            dataSettings: {
              ...widget.dataSettings,
              ...dataSettings
            }
          }
        })
      })
    )
}
