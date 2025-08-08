import { Injectable } from '@angular/core'
import { AccordionWrappers, FORMLY_ROW, FORMLY_W_1_2, FORMLY_W_FULL } from '@metad/story/designer'
import { map } from 'rxjs/operators'
import { HiddenLLM } from '@cloud/app/@shared/model'
import { DimensionModeling } from './dimension.schema'
import { HierarchySchemaService } from './hierarchy.schema'

@Injectable()
export class HierarchyAttributesSchema extends HierarchySchemaService {
  HIERARCHY: any

  getSchema() {
    return this.translate.stream('PAC.MODEL.SCHEMA').pipe(
      map((SCHEMA) => {
        this.SCHEMA = SCHEMA
        this.HIERARCHY = SCHEMA?.HIERARCHY

        const dimensionModeling = DimensionModeling(
          SCHEMA,
          this.getTranslationFun(),
          this.hierarchies$,
          this.fields$,
          this.otherDimensions(),
          this.helpWebsite()
        )
        dimensionModeling.key = 'dimension'
        return [
          {
            key: 'modeling',
            type: 'tabs',
            fieldGroup: [
              {
                props: {
                  label: this.HIERARCHY?.TITLE ?? 'Hierarchy',
                  icon: 'h_mobiledata'
                },
                fieldGroup: [this.getModeling()]
              },
              // {
              //   props: {
              //     label: SCHEMA?.DIMENSION?.TITLE ?? 'Dimension',
              //     icon: 'account_tree'
              //   },
              //   fieldGroup: [dimensionModeling]
              // }
            ]
          }
        ] as any
      })
    )
  }

  getModeling() {
    const HIERARCHY = this.HIERARCHY
    const COMMON = this.SCHEMA?.COMMON
    return {
      key: 'hierarchy',
      wrappers: ['panel'],
      props: {
        label: HIERARCHY?.Modeling ?? 'Modeling',
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
                label: HIERARCHY?.Name ?? 'Name',
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

        this.defaultMember(),

        ...AccordionWrappers([
          {
            key: 'semantics',
            label: COMMON?.Semantics ?? 'Semantics',
            toggleable: true,
            props: {
              help: this.helpWebsite() + '/docs/models/dimension-designer/semantics/'
            },
            fieldGroupClassName: FORMLY_ROW,
            fieldGroup: [
              HiddenLLM(COMMON),
            ]
          }
        ])
      ]
    }
  }
}
