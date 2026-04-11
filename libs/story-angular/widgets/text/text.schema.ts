import { Injectable } from '@angular/core'
import { EntityCapacity } from '@xpert-ai/ocap-angular/entity'
import { DataSettingsSchemaService, FORMLY_W_1_2, IntentNavigation } from '@xpert-ai/story/designer'
import { map } from 'rxjs/operators'

@Injectable()
export class TextSchemaService extends DataSettingsSchemaService {
  getSchema() {
    return this.translate.stream('Story.Widgets').pipe(
      map((i18n) => {
        const className = FORMLY_W_1_2
        const dataSettings = this.generateDataSettingsSchema(i18n?.Common)
        return [
          dataSettings,
          {
            key: 'options',
            wrappers: ['panel'],
            props: {
              padding: true,
            },
            fieldGroup: [
              {
                key: 'text',
                type: 'textarea',
                props: {
                  label: i18n?.Common?.Text ?? 'Text',
                  placeholder: i18n?.Common?.InsertText ?? `Insert Text...`,
                  autosize: true,
                  autosizeMinRows: 3,
                  dropEntity: true
                }
              },
              IntentNavigation(className, i18n, this.storyService)
            ]
          },
          {
            key: 'entity-type',
            type: 'entity-type',
            props: {
              dataSettings$: this.dataSettings$,
              capacities: [
                EntityCapacity.Measure,
                EntityCapacity.Calculation,
                EntityCapacity.Indicator,
                EntityCapacity.Parameter,
              ]
            }
          }
        ]
      })
    )
  }
}
