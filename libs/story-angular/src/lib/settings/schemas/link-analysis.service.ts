import { Injectable, Injector } from '@angular/core'
import { ISelectOption } from '@xpert-ai/ocap-angular/core'
import { LinkedAnalysisSettings, LinkedInteractionApplyTo, NxStoryService } from '@xpert-ai/story/core'
import { BaseDesignerSchemaService, BaseSchemaState } from '@xpert-ai/story/designer'
import { map, shareReplay, tap } from 'rxjs'

export interface LinkedAnalysisModel {
  widgets: ISelectOption[]
  linkedAnalysis: LinkedAnalysisSettings
}

@Injectable()
export class LinkedAnalysisSchemaService extends BaseDesignerSchemaService<BaseSchemaState<LinkedAnalysisModel>> {
  storyService: NxStoryService

  STORY_DESIGNER: any

  translate$ = this.translate.stream('STORY_DESIGNER').pipe(
    tap((STORY_DESIGNER) => {
      this.STORY_DESIGNER = STORY_DESIGNER
    }),
    shareReplay(1)
  )

  public readonly widgets$ = this.select((state) => state.model?.widgets ?? [])

  constructor(injector: Injector) {
    super(injector)
    this.storyService = this.injector.get(NxStoryService)
  }

  getTitle() {
    return this.translate$.pipe(map((STORY_DESIGNER) => STORY_DESIGNER?.BUILDER?.LinkedAnalysis?.Title))
  }

  getSchema() {
    return this.translate$.pipe(
      map((STORY_DESIGNER) => {
        this.STORY_DESIGNER = STORY_DESIGNER

        return this.getFields()
      })
    )
  }

  getFields() {
    const LinkedAnalysis = this.STORY_DESIGNER?.BUILDER?.LinkedAnalysis
    return [
      {
        key: 'widgets',
        type: 'empty',
      },
      {
        key: 'linkedAnalysis',
        wrappers: ['panel'],
        templateOptions: {
          padding: true
        },
        fieldGroup: [
          {
            key: 'interactionApplyTo',
            type: 'radio',
            className: 'pac-formly-radio__column',
            templateOptions: {
              label: LinkedAnalysis?.InteractionApplyTo ?? 'Interaction Apply To',
              required: true,
              options: [
                {
                  value: LinkedInteractionApplyTo.OnlyThisWidget,
                  label: LinkedAnalysis?.OnlyThisWidget ?? 'Only this Widget'
                },
                {
                  value: LinkedInteractionApplyTo.AllWidgetsOnPage,
                  label: LinkedAnalysis?.AllWidgetsInThePage ?? 'All widgets on this Page'
                },
                {
                  value: LinkedInteractionApplyTo.OnlySelectedWidgets,
                  label: LinkedAnalysis?.OnlySelectedWidgets ?? 'Only selected widgets'
                }
              ]
            }
          },

          {
            hideExpression: `model === null || model.interactionApplyTo !== 'OnlySelectedWidgets'`,
            key: 'connectNewly',
            type: 'checkbox',
            templateOptions: {
              label: LinkedAnalysis?.ConnectNewly ?? 'Automatically connect newly created widgets'
            }
          },

          {
            hideExpression: `model === null || model.interactionApplyTo !== 'OnlySelectedWidgets'`,
            key: 'linkedWidgets',
            type: 'select',
            templateOptions: {
              label: LinkedAnalysis?.SelectWidgets ?? 'Select Widgets',
              multiple: true,
              options: this.widgets$
            }
          }
        ]
      }
    ]
  }
}
