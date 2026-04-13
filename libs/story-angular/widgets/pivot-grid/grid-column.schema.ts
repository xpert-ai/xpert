import { Injectable, Injector } from '@angular/core'
import { DesignerSchemaService } from '@xpert-ai/story/designer'

@Injectable()
export class GridColumnSchema extends DesignerSchemaService {

  constructor(injector: Injector) {
    super(injector)
  }

  getBuilderSchema() {
    return [
      {
        wrappers: ['panel'],
        templateOptions: {
          padding: true
        },
        fieldGroup: [
          {
            fieldGroupClassName: 'ngm-formly__row',
            fieldGroup: [
              {
                className: 'ngm-formly__col ngm-formly__col-6',
                key: 'name',
                type: 'input',
                templateOptions: {
                  label: 'Name',
                  readonly: true
                },
              },
              {
                className: 'ngm-formly__col ngm-formly__col-6',
                key: 'label',
                type: 'input',
                templateOptions: {
                  label: 'Label',
                },
              },
              {
                className: 'ngm-formly__col ngm-formly__col-6',
                key: 'filterable',
                type: 'toggle',
                templateOptions: { label: 'Filterable' },
              },
              {
                className: 'ngm-formly__col ngm-formly__col-6',
                key: 'groupable',
                type: 'toggle',
                templateOptions: { label: 'Groupable' },
              },
              {
                className: 'ngm-formly__col ngm-formly__col-6',
                key: 'sortable',
                type: 'toggle',
                templateOptions: { label: 'Sortable' },
              },
            ]
          },
          {
            key: 'semantic',
            type: 'code-editor',
            templateOptions: { label: 'Column Semantics' },
          }
        ]
      }
    ] as any
  }

  getStylingSchema() {
    return []
  }
}
