import { Injectable } from '@angular/core'
import { toObservable } from '@angular/core/rxjs-interop'
import { HiddenLLM, MeasureExpressionAccordion, MODEL_TYPE } from '@cloud/app/@shared/model'
import { nonBlank, PropertyMeasure } from '@metad/ocap-core'
import { AccordionWrappers, FORMLY_ROW, FORMLY_W_1_2, FORMLY_W_FULL } from '@metad/story/designer'
import { combineLatest, filter, map, switchMap } from 'rxjs'
import { CubeSchemaService } from './cube.schema'

@Injectable()
export class MeasureSchemaService extends CubeSchemaService<PropertyMeasure> {
  readonly modelType = this.modelService.modelType
  readonly modelType$ = toObservable(this.modelService.modelType)

  readonly factTableOptions$ = this.factTables$.pipe(
    map((tables) =>
      tables.map((table) => ({
        value: table.name,
        caption: table.caption || table.name
      }))
    )
  )

  // Fact name
  readonly measureTableName$ = combineLatest([this.modeling$, this.cube$]).pipe(
    map(([modeling, cube]) => {
      if (!cube) return null;
      if (cube.fact?.type === 'table') {
        return cube.fact.table?.name
      } else if (cube.fact?.type === 'view') {
        return cube.fact.view?.alias
      } else {
        return modeling?.table || cube.fact?.tables?.[0]?.name
      }
    })
  )
  readonly factFields$ = this.measureTableName$.pipe(
      filter(nonBlank),
      switchMap((table) => this.modelService.selectOriginalEntityProperties(table)),
      map((properties) => [
        {
          value: null,
          key: null,
          caption: this.getTranslation('PAC.KEY_WORDS.None', { Default: 'None' })
        },
        ...properties.map((property) => ({
          value: property.name,
          key: property.name,
          caption: property.caption
        }))
      ])
    )

  getSchema() {
    return combineLatest([this.translate.stream('PAC.MODEL.SCHEMA'), this.modelType$]).pipe(
      map(([SCHEMA]) => {
        this.SCHEMA = SCHEMA

        return [
          {
            type: 'tabs',
            fieldGroup: [
              {
                props: {
                  label: SCHEMA?.MEASURE?.Title ?? 'Measure',
                  icon: 'straighten'
                },
                fieldGroup: this.measureSettings
              }
            ]
          } as any
        ]
      })
    )
  }

  // name="Unit Sales" column="unit_sales" aggregator="sum" formatString="#,###"
  get measureSettings() {
    const COMMON = this.SCHEMA?.COMMON
    const MEASURE = this.SCHEMA?.MEASURE
    const className = FORMLY_W_1_2
    return [
      {
        key: 'modeling',
        fieldGroup: [
          {
            wrappers: ['panel'],
            props: {
              padding: true
            },
            fieldGroupClassName: FORMLY_ROW,
            fieldGroup: [
              {
                key: 'name',
                type: 'input',
                className,
                props: {
                  label: COMMON?.Name ?? 'Name',
                  required: true
                }
              },
              {
                key: 'caption',
                type: 'input',
                className,
                props: {
                  label: COMMON?.Caption ?? 'Caption'
                }
              },
              {
                className: FORMLY_W_FULL,
                key: 'description',
                type: 'textarea',
                props: {
                  label: COMMON?.Description ?? 'Description',
                  rows: 1,
                  autosize: true
                }
              },
              ...(this.modelType() === MODEL_TYPE.SQL ? [
                {
                  key: 'table',
                  type: 'select',
                  className,
                  props: {
                    label: COMMON?.Table ?? 'Table',
                    options: this.factTableOptions$,
                    searchable: true,
                    key: 'key'
                  },
                },
              ] : []),
              {
                key: 'column',
                type: 'select',
                className,
                props: {
                  label: COMMON?.Column ?? 'Column',
                  options: this.factFields$,
                  searchable: true
                },
                expressionProperties: {
                  'props.required':
                    '!(model.measureExpression && model.measureExpression.sql && model.measureExpression.sql.content)'
                }
              },
              {
                key: 'aggregator',
                type: 'select',
                className,
                props: {
                  label: MEASURE?.Aggregator ?? 'Aggregator',
                  options: [
                    { value: 'sum', label: 'Sum' },
                    { value: 'count', label: 'Count' },
                    { value: 'min', label: 'Min' },
                    { value: 'max', label: 'Max' },
                    { value: 'avg', label: 'Avg' },
                    { value: 'distinct-count', label: 'Distinct Count' }
                  ]
                }
              },
              {
                className,
                key: 'datatype',
                type: 'select',
                props: {
                  icon: 'ballot',
                  label: COMMON?.DataType ?? 'Data Type',
                  options: [
                    { value: 'String', label: 'String' },
                    { value: 'Integer', label: 'Integer' },
                    { value: 'Numeric', label: 'Numeric' }
                    // { value: 'Boolean', label: 'Boolean' },
                    // { value: 'Date', label: 'Date' },
                    // { value: 'Time', label: 'Time' },
                    // { value: 'Timestamp', label: 'Timestamp' }
                  ]
                }
              },
              {
                className,
                key: 'visible',
                type: 'checkbox',
                defaultValue: true,
                props: {
                  label: COMMON?.Visible ?? 'Visible'
                }
              },
              {
                className: FORMLY_W_FULL,
                key: 'formatString',
                type: 'input',
                props: {
                  label: MEASURE?.FormatString ?? 'Format String',
                  icon: 'text_format'
                }
              }
            ]
          },
          ...AccordionWrappers([
            MeasureExpressionAccordion(COMMON, ''),
            {
              key: 'semantics',
              label: COMMON?.Semantics ?? 'Semantics',
              toggleable: true,
              props: {
                help: this.helpWebsite() + '/docs/models/dimension-designer/semantics/'
              },
              fieldGroupClassName: FORMLY_ROW,
              fieldGroup: [HiddenLLM(COMMON)]
            }
          ])
        ]
      }
    ]
  }
}
