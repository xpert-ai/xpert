import { Injectable } from '@angular/core'
import { FORMLY_ROW, FORMLY_W_1_2, FORMLY_W_FULL } from '@metad/story/designer'
import { map } from 'rxjs/operators'
import { HierarchySchemaService } from './hierarchy.schema'
import { SemanticsAccordionWrapper } from '@cloud/app/@shared/model/studio/types'

@Injectable()
export class LevelAttributesSchema extends HierarchySchemaService {
  private LEVEL: any

  getSchema() {
    return this.translate.stream('PAC.MODEL.SCHEMA').pipe(
      map((SCHEMA) => {
        this.SCHEMA = SCHEMA
        this.LEVEL = SCHEMA.LEVEL
        return [
          {
            key: 'modeling',
            type: 'tabs',
            fieldGroup: [
              {
                props: {
                  label: this.LEVEL?.Level ?? 'Level',
                  icon: 'format_list_numbered'
                },
                fieldGroup: [
                  this.levelModeling
                  // this.levelProperty,
                ]
              },
              // this.dataDistribution as any
            ]
          }
        ]
      })
    )
  }

  get levelModeling() {
    const COMMON = this.SCHEMA.COMMON
    const LEVEL = this.LEVEL
    return {
      // key: 'modeling',
      wrappers: ['panel'],
      props: {
        label: LEVEL?.Modeling ?? 'Modeling',
        padding: true
      },
      fieldGroup: [
        {
          fieldGroupClassName: FORMLY_ROW,
          fieldGroup: [
            {
              key: 'name',
              type: 'input',
              className: FORMLY_W_1_2,
              props: {
                label: LEVEL?.Name ?? 'Name',
                readonly: true
              }
            },
            {
              key: 'caption',
              type: 'input',
              className: FORMLY_W_1_2,
              props: {
                label: COMMON?.Caption ?? 'Caption'
              }
            },
            {
              key: 'description',
              type: 'textarea',
              className: FORMLY_W_FULL,
              props: {
                label: COMMON?.Description ?? 'Description',
              }
            },
            {
              className: FORMLY_W_1_2,
              key: 'visible',
              type:'checkbox',
              props: {
                label: COMMON?.Visible ?? 'Visible',
              }
            },
          ]
        },

        ...SemanticsAccordionWrapper(COMMON, '')
      ]
    }
  }
}
