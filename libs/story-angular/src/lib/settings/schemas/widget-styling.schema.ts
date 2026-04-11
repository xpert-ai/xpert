import { Injectable } from '@angular/core'
import { StoryWidget } from '@xpert-ai/story/core'
import {
  Appearances,
  BaseDesignerSchemaService,
  BaseSchemaState,
  FORMLY_ROW,
  FORMLY_W_1_2
} from '@xpert-ai/story/designer'
import { map } from 'rxjs/operators'

@Injectable()
export class WidgetStylingSchema extends BaseDesignerSchemaService<BaseSchemaState<StoryWidget['styling']>> {
  getSchema() {
    return this.translate.stream('Story').pipe(
      map((DESIGNER) => {
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
                  label: DESIGNER?.Widgets?.Common?.ComponentStyling ?? 'Component Styling',
                  expanded: true,
                }
              },

              {
                key: 'appearance',
                props: {
                  label: DESIGNER?.Widgets?.Common?.Appearance ?? 'Appearance',
                  expanded: true,
                },
                fieldGroupClassName: FORMLY_ROW,
                fieldGroup: Appearances(FORMLY_W_1_2, DESIGNER?.Widgets?.Common)
              }
            ]
          }
        ]
      })
    )
  }
}
