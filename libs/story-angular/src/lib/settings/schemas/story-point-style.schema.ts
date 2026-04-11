import { Injectable } from '@angular/core'
import { StoryPoint } from '@xpert-ai/story/core'
import { BaseDesignerSchemaService, BaseSchemaState, FORMLY_W_1_2, StylingCssSchema } from '@xpert-ai/story/designer'
import { map } from 'rxjs/operators'

@Injectable()
export class StoryPointStylingSchema extends BaseDesignerSchemaService<BaseSchemaState<StoryPoint['styling']>> {
  getSchema() {
    return this.translate.stream('STORY_DESIGNER').pipe(
      map((DESIGNER) => {
        return [
          {
            key: 'canvas',
            wrappers: ['accordion'],
            props: {
              label: DESIGNER?.STYLING?.CANVAS?.TITLE ?? 'Canvas'
            },
            fieldGroupClassName: 'ngm-formly__row',
            fieldGroup: StylingCssSchema(FORMLY_W_1_2, DESIGNER)
          },
          {
            wrappers: ['accordion'],
            props: {
              label: DESIGNER?.STYLING?.STORY_PAGE?.DefaultBackground ?? 'Default Background'
            },
            fieldGroup: [
              {
                key: 'background',
                type: 'background-color',
                props: {
                  label: DESIGNER?.STYLING?.STORY_PAGE?.PresetBackground ?? 'Preset Background'
                }
              }
            ]
          },
          {
            key: 'pageSize',
            wrappers: ['accordion'],
            props: {
              label: DESIGNER?.STYLING?.STORY_PAGE?.PAGE_SIZE ?? 'Page Size'
            },
            fieldGroup: [
              {
                key: 'type',
                type: 'radio',
                props: {
                  label: DESIGNER?.STYLING?.STORY_PAGE?.PageType ?? 'Page Type',
                  required: true,
                  options: [
                    { value: 'dynamic', label: DESIGNER?.STYLING?.STORY_PAGE?.Dynamic ?? 'Dynamic' },
                    { value: 'fixed', label: DESIGNER?.STYLING?.STORY_PAGE?.Fixed ?? 'Fixed' }
                  ]
                }
              },
              {
                hideExpression: `!model || model.type !== 'fixed'`,
                fieldGroup: [
                  {
                    key: 'size',
                    type: 'ngm-select',
                    props: {
                      label: '预设大小',
                      options: [
                        { value: 'A4', label: 'A4' },
                        { value: 'A3', label: 'A3' },
                        { value: 'Custom', label: 'Custom' }
                      ]
                    }
                  },
                  {
                    key: 'continuousHeight',
                    type: 'toggle',
                    props: {
                      label: DESIGNER?.STYLING?.STORY_PAGE?.ContinuousHeight ?? 'Continuous Height'
                    }
                  }
                ]
              }
            ]
          }
        ]
      })
    )
  }
}
