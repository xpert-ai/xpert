import { Injectable } from '@angular/core'
import { EntityCapacity } from '@xpert-ai/ocap-angular/entity'
import { DataSettingsSchemaService, SchemaState } from '@xpert-ai/story/designer'
import { map } from 'rxjs/operators'

@Injectable()
export class DocumentSchemaService extends DataSettingsSchemaService<SchemaState> {

  getSchema() {
    return this.translate.stream('Story.Widgets').pipe(
      map((i18n) => {
        this.STORY_DESIGNER = i18n
        const dataSettings = this.generateDataSettingsSchema(i18n?.Common)
        return [
          dataSettings,
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
