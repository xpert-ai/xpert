import { Injectable } from '@angular/core'
import { DimensionUsage } from '@metad/ocap-core'
import { FORMLY_ROW, FORMLY_W_1_2 } from '@metad/story/designer'
import { map } from 'rxjs'
import { CubeSchemaService } from './cube.schema'

@Injectable()
export class DimensionUsageSchemaService extends CubeSchemaService<DimensionUsage> {
  
  readonly sharedDimensionOptions$ = this.modelService.sharedDimensions$.pipe(
    map((dimensions) => dimensions?.map((dimension) => ({ key: dimension.name, caption: dimension.caption })))
  )

  getSchema() {
    return this.translate.stream('PAC.MODEL.SCHEMA').pipe(
      map((SCHEMA) => {
        this.SCHEMA = SCHEMA
        return [
          {
            type: 'tabs',
            fieldGroup: [
              {
                props: {
                  label: SCHEMA?.DimensionUsage?.Title ?? 'Dimension Usage',
                  icon: 'account_tree'
                },
                fieldGroup: this.usageSettings
              },
              // this.dataDistribution
            ]
          }
        ]
      })
    )
  }

  get usageSettings() {
    const COMMON = this.SCHEMA?.COMMON
    const className = FORMLY_W_1_2
    return [
      {
        key: 'modeling',
        wrappers: ['panel'],
        props: {
          label: COMMON?.Modeling ?? 'Modeling',
          padding: true
        },
        fieldGroup: [
          {
            fieldGroupClassName: FORMLY_ROW,
            fieldGroup: [
              {
                className,
                key: 'name',
                type: 'input',
                props: {
                  required: true,
                  label: COMMON?.Name ?? 'Name'
                }
              },
              {
                className,
                key: 'caption',
                type: 'input',
                props: {
                  label: COMMON?.Caption ?? 'Caption'
                }
              },
              {
                className,
                key: 'source',
                type: 'ngm-select',
                props: {
                  label: COMMON?.SourceDimension ?? 'Source Dimension',
                  options: this.sharedDimensionOptions$,
                  valueKey: 'key'
                }
              },
              {
                className,
                key: 'foreignKey',
                type: 'ngm-select',
                props: {
                  required: true,
                  searchable: true,
                  label: COMMON?.FactForeignKey ?? 'Foreign Key of Fact',
                  options: this.factFields$,
                  valueKey: 'key',
                }
              },
              {
                className: FORMLY_W_1_2,
                key: 'visible',
                type:'checkbox',
                defaultValue: true,
                props: {
                  label: COMMON?.Visible ?? 'Visible',
                }
              },
            ]
          }
        ]
      }
    ]
  }
}
