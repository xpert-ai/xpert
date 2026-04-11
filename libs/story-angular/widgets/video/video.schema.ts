import { Injectable } from '@angular/core'
import { DataSettingsSchemaService } from '@xpert-ai/story/designer'
import { map } from 'rxjs/operators'

@Injectable()
export class ImageSchemaService extends DataSettingsSchemaService {
  getSchema() {
    return this.translate.stream('Story.Widgets').pipe(
      map((I18nWidgets) => {
        return [
          {
            key: 'options',
            wrappers: ['panel'],
            props: {
              padding: true,
            },
            fieldGroup: [
              {
                key: 'videoUrl',
                type: 'input-inline',
                props: {
                  label: I18nWidgets?.Video?.VideoUrl ?? 'Video Url',
                }
              }
            ]
          }
        ]
      })
    )
  }
}
