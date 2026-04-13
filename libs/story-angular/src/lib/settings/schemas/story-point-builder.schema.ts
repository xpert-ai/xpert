import { Injectable, Injector } from '@angular/core'
import { StoryPoint } from '@xpert-ai/story/core'
import { BaseDesignerSchemaService, FORMLY_ROW, FORMLY_W_1_2, SchemaState } from '@xpert-ai/story/designer'
import { map } from 'rxjs/operators'
import { gridsterOptions } from './types'

export interface StoryPointSchemaState extends SchemaState {
  model: {
    gridOptions: StoryPoint['gridOptions']
  }
}

@Injectable()
export class StoryPointBuilderSchema extends BaseDesignerSchemaService<StoryPointSchemaState> {
  constructor(injector: Injector) {
    super(injector)
  }

  getSchema() {
    return this.translate.stream('Story').pipe(
      map((Story) => {
        return [this.getGridOptions(Story?.GridOptions)]
      })
    )
  }

  getGridOptions(I18NGridOptions) {
    const className = FORMLY_W_1_2
    return {
      wrappers: ['accordion'],
      props: {
        expandedMulti: true,
        elevationZ: true,
      },
      fieldGroup: [
        {
          fieldGroupClassName: FORMLY_ROW,
          key: 'gridOptions',
          props: {
            label: I18NGridOptions?.TITLE ?? 'Grid Layout',
            expanded: true
          },
          fieldGroup: gridsterOptions(className, I18NGridOptions)
        }
      ]
    }
  }
}
