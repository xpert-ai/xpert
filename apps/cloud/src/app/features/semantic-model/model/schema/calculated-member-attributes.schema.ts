import { Injectable } from '@angular/core'
import { C_MEASURES, CalculatedMember, compact, flatten, getEntityDimensions } from '@metad/ocap-core'
import { FORMLY_ROW, FORMLY_W_1_2, FORMLY_W_FULL } from '@metad/story/designer'
import { FormlyFieldConfig } from '@ngx-formly/core'
import { combineLatestWith, firstValueFrom, map, shareReplay, switchMap } from 'rxjs'
import { HiddenLLM } from '@cloud/app/@shared/model'
import { CubeSchemaService } from './cube.schema'

@Injectable()
export class CalculatedMemberAttributesSchema extends CubeSchemaService<CalculatedMember> {
  readonly calculatedMember$ = this.select((state) => state.modeling)
  
  readonly memberDimension$ = this.calculatedMember$.pipe(map((calculatedMember) => calculatedMember?.dimension))

  readonly runtimeDimension$ = this.entityService?.originalEntityType$.pipe(
    map((entityType) => {
      return [
        {
          key: null,
          value: null,
          caption: this.getTranslation('PAC.KEY_WORDS.None', { Default: 'None' })
        },
        {
          key: C_MEASURES,
          value: C_MEASURES,
          caption: this.getTranslation('PAC.KEY_WORDS.Measures', { Default: 'Measures' })
        },
        ...getEntityDimensions(entityType).map((item) => ({
          key: item.name,
          value: item.name,
          caption: item.caption
        }))
      ]
    })
  )

  public readonly rtHierarchies$ = this.entityService.entityType$.pipe(
    combineLatestWith(this.memberDimension$),
    switchMap(async ([entityType, dimension]) => {
      if (dimension === C_MEASURES) {
        return [
          {
            key: C_MEASURES,
            value: C_MEASURES,
            caption: await firstValueFrom(this.translate.get('PAC.KEY_WORDS.Measures', { Default: 'Measures' }))
          }
        ]
      }

      const dimensions = getEntityDimensions(entityType).filter((item) => item.name === dimension)
      return compact(flatten(dimensions.map((dim) => dim.hierarchies))).map((property) => ({
        key: property.name,
        value: property.name,
        caption: property.caption
      }))
    }),
    shareReplay(1)
  )

  getSchema() {
    return this.translate.stream('PAC.MODEL.SCHEMA').pipe(
      map((SCHEMA) => {
        this.SCHEMA = SCHEMA
        const CUBE = this.SCHEMA?.CUBE
        return [
          {
            type: 'tabs',
            fieldGroup: [this.builder]
          }
        ] as FormlyFieldConfig[]
      })
    )
  }

  get builder() {
    const BUILDER = this.SCHEMA?.CALCULATED_MEMBER
    return {
      props: {
        label: BUILDER?.Title ?? 'Calculated Member',
        icon: 'functions'
      },
      fieldGroup: this.calculatedSettings
    }
  }

  get calculatedSettings() {
    const COMMON = this.SCHEMA?.COMMON
    const CALCULATED_MEMBER = this.SCHEMA?.CALCULATED_MEMBER
    const className = FORMLY_W_1_2
    return [
      {
        key: 'modeling',
        wrappers: ['panel'],
        props: {
          padding: true
        },
        fieldGroup: [
          {
            fieldGroupClassName: FORMLY_ROW,
            fieldGroup: [
              {
                key: 'name',
                type: 'input',
                className,
                props: {
                  label: COMMON?.Name || 'Name',
                  required: true,
                  appearance: 'standard'
                }
              },
              {
                key: 'caption',
                type: 'input',
                className,
                props: {
                  label: COMMON?.Caption ?? 'Caption',
                  appearance: 'standard'
                }
              },
              {
                className: FORMLY_W_FULL,
                key: 'description',
                type: 'textarea',
                props: {
                  label: COMMON?.Description ?? 'Description',
                  rows: 1,
                  autosize: true,
                }
              }
            ]
          },
          {
            fieldGroupClassName: FORMLY_ROW,
            fieldGroup: [
              {
                key: 'dimension',
                type: 'ngm-select',
                className,
                props: {
                  label: COMMON?.Dimension ?? 'Dimension',
                  valueKey: 'key',
                  options: this.runtimeDimension$,
                  searchable: true,
                  appearance: 'standard'
                }
                // validators: {
                //   ip: {
                //     expression: (c) => (c.parent.value.hierarchy && !c.value) || (!c.parent.value.hierarchy && c.value) ,
                //     message: `维度和层级必输一个且不能同时设置`,
                //   },
                // },
              },
              {
                key: 'hierarchy',
                type: 'ngm-select',
                className,
                props: {
                  label: COMMON?.Hierarchy ?? 'Hierarchy',
                  valueKey: 'key',
                  options: this.rtHierarchies$,
                  searchable: true,
                  appearance: 'standard'
                },
                expressionProperties: {
                  hide: `!model || model.dimension==='Measures'`
                }
                // validators: {
                //   ip: {
                //     expression: (c) => (c.parent.value.dimension && !c.value) || (!c.parent.value.dimension && c.value) ,
                //     message: `维度和层级必输一个且不能同时设置`,
                //   },
                // },
              },
              {
                key: 'parent',
                type: 'input',
                className,
                props: {
                  label: CALCULATED_MEMBER?.Parent ?? 'Parent',
                  appearance: 'standard'
                }
              },
              {
                className,
                key: 'visible',
                type: 'checkbox',
                // defaultValue: true,
                props: {
                  label: COMMON?.Visible ?? 'Visible',
                  appearance: 'standard'
                }
              },
              {
                className,
                key: 'dataType',
                type: 'select',
                props: {
                  label: COMMON?.DataType ?? 'Data Type',
                  options: [
                    { value: null, label: this.getTranslation('PAC.KEY_WORDS.None', { Default: 'None' }) },
                    { value: 'String', label: 'String' },
                    { value: 'Integer', label: 'Integer' },
                    { value: 'Numeric', label: 'Numeric' }
                  ],
                  appearance: 'standard'
                }
              },
              {
                key: 'solveOrder',
                type: 'input',
                className,
                props: {
                  label: CALCULATED_MEMBER?.SolveOrder ?? 'Solve Order',
                  placeholder: 'Number',
                  appearance: 'standard'
                }
              },
              {
                className: FORMLY_W_FULL,
                key: 'formula',
                type: 'textarea',
                props: {
                  label: CALCULATED_MEMBER?.Formula ?? 'Formula',
                  autosize: true,
                  required: true,
                  appearance: 'fill'
                }
              }
            ]
          },
          {
            key: 'formatting',
            fieldGroupClassName: FORMLY_ROW,
            fieldGroup: [
              {
                className,
                key: 'unit',
                type: 'input',
                props: {
                  label: COMMON?.Unit ?? 'Unit',
                  appearance: 'standard'
                }
              },
              {
                className,
                key: 'decimal',
                type: 'input',
                props: {
                  label: COMMON?.Decimal ?? 'Decimal',
                  appearance: 'standard'
                }
              }
            ]
          },

          {
            key: 'semantics',
            wrappers: ['panel'],
            props: {
              label: COMMON?.Semantics ?? 'Semantics',
            },
            fieldGroup: [
              {
                fieldGroupClassName: FORMLY_ROW,
                fieldGroup: [
                  HiddenLLM(COMMON),
                ]
              }
            ]
          }
        ]
      }
    ]
  }
}
