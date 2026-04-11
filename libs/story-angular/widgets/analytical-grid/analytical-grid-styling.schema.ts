import { Injectable } from '@angular/core'
import { StoryWidget } from '@xpert-ai/story/core'
import {
  AccordionWrappers,
  Appearances,
  BaseDesignerSchemaService,
  BaseSchemaState,
  FORMLY_ROW,
  FORMLY_W_1_2,
} from '@xpert-ai/story/designer'
import { map } from 'rxjs/operators'

@Injectable()
export class AnalyticalGridStylingSchema extends BaseDesignerSchemaService<BaseSchemaState<StoryWidget['styling']>> {
  getSchema() {
    return this.translate.stream('Story.Widgets').pipe(
      map((i18n) => {
        return [
          {
            wrappers: ['accordion'],
            props: {
              expandedMulti: true,
              elevationZ: true,
            },
            fieldGroup: [
              {
                key: 'component',
                type: 'styling',
                props: {
                  label: i18n?.Common?.ComponentStyling ?? 'Component Styling',
                  expanded: true
                }
              },

              {
                key: 'appearance',
                props: {
                  label: i18n?.Common?.Appearance ?? 'Appearance',
                  expanded: true,
                },
                fieldGroupClassName: FORMLY_ROW,
                fieldGroup: Appearances(FORMLY_W_1_2, i18n?.Common)
              }
            ]
          },

          ...AccordionWrappers([
            {
              key: 'bar',
              label: i18n?.AnalyticalGrid?.Bar ?? 'Bar',
              fieldGroup: [
                {
                  fieldGroupClassName: FORMLY_ROW,
                  fieldGroup: [
                    {
                      className: FORMLY_W_1_2,
                      key: 'backgroundColor',
                      type: 'color',
                      props: {
                        label: i18n?.Common?.BackgroundColor ?? 'Background Color'
                      }
                    }
                  ]
                }
              ]
            }
          ])
        ]
      })
    )
  }
}
