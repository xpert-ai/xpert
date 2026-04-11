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
                key: 'imageUrl',
                type: 'input-inline',
                props: {
                  label: I18nWidgets?.Image?.ImageUrl ?? 'Image Url',
                }
              },
              {
                key: 'imageObj',
                type: 'image-upload',
                props: {
                  label: I18nWidgets?.Common?.Image ?? 'Image',
                }
              },
              {
                key: 'imageSizeMode',
                type: 'button-toggle',
                defaultValue: 'strecth',
                props: {
                  label: I18nWidgets?.Image?.ImageSizeMode ?? 'Size Mode',
                  options: [
                    {
                      label: I18nWidgets?.Image?.ImageSizeModeFitComponent ?? 'Fit Component',
                      value: 'strecth'
                    },
                    {
                      label: I18nWidgets?.Image?.ImageSizeModeFitWidth ?? 'Fit Width',
                      value: 'fitWidth'
                    },
                    {
                      label: I18nWidgets?.Image?.ImageSizeModeFitHeight ?? 'Fit Height',
                      value: 'fitHeight'
                    },
                    {
                      label: I18nWidgets?.Image?.ImageSizeModeOriginalSize ?? 'Original Size',
                      value: 'originalSize'
                    }
                  ]
                }
              }
            ]
          }
        ]
      })
    )
  }
}
