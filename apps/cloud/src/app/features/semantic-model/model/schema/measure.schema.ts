import { Injectable } from '@angular/core'
import { AccordionWrappers, FORMLY_ROW, FORMLY_W_1_2, FORMLY_W_FULL } from '@metad/story/designer'
import { map } from 'rxjs'
import { HiddenLLM, MeasureExpressionAccordion } from '@cloud/app/@shared/model'
import { CubeSchemaService } from './cube.schema'

@Injectable()
export class MeasureSchemaService extends CubeSchemaService {
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
              {
                key: 'column',
                type: 'ngm-select',
                className,
                props: {
                  label: COMMON?.Column ?? 'Column',
                  options: this.factFields$,
                  searchable: true,
                  valueKey: 'key'
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
              fieldGroup: [
                HiddenLLM(COMMON),
              ]
            }
          ])
        ]
      }
    ]
  }
}
