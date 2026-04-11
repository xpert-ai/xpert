import { Injectable } from '@angular/core'
import { BaseDesignerSchemaService } from '@xpert-ai/story/designer'
import { map } from 'rxjs/operators'

@Injectable()
export class IFrameSchemaService extends BaseDesignerSchemaService {
  STORY_DESIGNER: any

  getSchema() {
    return this.translate.stream('Story').pipe(
      map((STORY_DESIGNER) => {
        this.STORY_DESIGNER = STORY_DESIGNER
        const COMMON = this.STORY_DESIGNER?.Widgets.Common
        return [
          {
            key: 'options',
            wrappers: ['panel'],
            props: {
              label: COMMON?.Options ?? 'Options',
              padding: true
            },
            fieldGroup: [
              {
                key: 'title',
                type: 'input-inline',
                props: {
                  label: COMMON.Title ?? 'Title'
                }
              },
              {
                key: 'src',
                type: 'input-inline',
                props: {
                  label: STORY_DESIGNER?.Widgets?.IFrame?.SRC ?? 'src'
                }
              }
            ]
          }
        ]
      })
    )
  }
}
