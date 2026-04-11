import { Injectable, Injector } from '@angular/core'
import { StylingWidgetSchema } from '@xpert-ai/story/designer'
import { GridOptions, PivotGridSchemaService } from '@xpert-ai/story/widgets/pivot-grid'

@Injectable()
export class SmartGridSettingsSchemaService extends PivotGridSchemaService {
  constructor(injector: Injector) {
    super(injector)
  }

  getBuilderSchema() {
    
    const dataSettings = this.generateDataSettingsSchema(
      {
        key: 'lineItemAnnotation',
        wrappers: ['panel'],
        templateOptions: {
          label: '表格字段配置',
          required: true
        },
        fieldGroup: [
          {
            key: 'dataFields',
            type: 'array',
            templateOptions: {
              // label: '字段们',
              required: true,
              disableDelete: true
            },
            fieldArray: {
              type: 'property-select',
              key: 'dataFields',
              templateOptions: {
                label: 'DataField',
                placeholder: 'select Field',
                required: true,
                removable: true,
                showMeasures: true,
                dataSettings: this.dataSettings$,
                entityType: this.entityType$
              }
            }
          }
        ]
      },
      this.presentationVariant as any,
      this.selectionVariant as any
    )

    return [
      {
        wrappers: ['panel'],
        templateOptions: {
          padding: true
        },
        fieldGroup: [
          {
            key: 'title',
            type: 'input',
            templateOptions: {
              label: '标题',
              required: true
            },
          },
        ]
      },
      dataSettings,

      {
        key: 'options',
        templateOptions: {
          label: 'Grid Options',
        },
        fieldGroup: GridOptions(null)
      }
    ] as any
  }

  getStylingSchema(BUILDER) {
    return [
      StylingWidgetSchema(BUILDER),
    ]
  }
}
