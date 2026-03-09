import { Injectable } from '@angular/core'
import { DisplayBehaviour } from '@metad/ocap-core'
import {
  DataSettingsSchema,
  DataSettingsSchemaService,
  FORMLY_ROW,
  FORMLY_W_1_2,
  FORMLY_W_FULL,
} from '@metad/story/designer'
import { map } from 'rxjs/operators'
import { YoyType } from './types'

@Injectable()
export class IndicatorCardSchemaService extends DataSettingsSchemaService {
  public fields: any

  getSchema() {
    return this.translate.stream('STORY_DESIGNER').pipe(
      map((STORY_DESIGNER) => {
        this.STORY_DESIGNER = STORY_DESIGNER
        return this.getBuilderSchema(STORY_DESIGNER?.BUILDER)
      })
    )
  }

  getBuilderSchema(BUILDER) {
    const dataSettings = DataSettingsSchema(BUILDER, this.selectDataSourceList(), this._dataSource$)

    dataSettings.wrappers = []

    const IndicatorCard = this.STORY_DESIGNER?.BUILDER?.IndicatorCard

    return [
      {
        wrappers: ['panel'],
        props: {
          label: IndicatorCard?.Options ?? 'Options',
          padding: true
        },
        fieldGroup: [
          dataSettings,
          {
            key: 'options',
            fieldGroup: this.indicatorCard
          }
        ]
      }
    ]
  }

  get indicatorCard() {
    const className = FORMLY_W_1_2
    const IndicatorCard = this.STORY_DESIGNER?.BUILDER?.IndicatorCard
    return [
      {
        fieldGroupClassName: FORMLY_ROW,
        fieldGroup: [
          {
            className,
            key: 'title',
            type: 'input',
            props: {
              label: IndicatorCard?.Alias ?? 'Alias'
            }
          },
          {
            className,
            key: 'code',
            type: 'ngm-select',
            props: {
              label: IndicatorCard?.Indicator ?? 'Indicator',
              searchable: true,
              displayBehaviour: DisplayBehaviour.auto,
              options: this.indicatorSelectOptions$
            }
          },
          // {
          //   className,
          //   key: 'type',
          //   type: 'select',
          //   props: {
          //     label: IndicatorCard?.IndicatorType ?? 'Type',
          //     // placeholder: '请选择类型',
          //     options: [
          //       {
          //         value: CardType.COMMON,
          //         label: '普通卡片'
          //       },
          //       {
          //         value: CardType.RATIO,
          //         label: '比例卡片'
          //       }
          //     ]
          //   }
          // },
          // {
          //   className,
          //   key: 'yoyType',
          //   type: 'select',
          //   hideExpression: `!model || model.disabledYoy !== false`,
          //   props: {
          //     label: IndicatorCard?.YoYType ?? 'YoY Type',
          //     options: [
          //       {
          //         value: YoyType.PROPORTION,
          //         label: '比例'
          //       },
          //       {
          //         value: YoyType.GAP,
          //         label: '差值'
          //       }
          //     ]
          //   }
          // }
        ]
      },
      {
        fieldGroupClassName: FORMLY_ROW,
        fieldGroup: [
          {
            className,
            key: 'disabledYoy',
            type: 'checkbox',
            defaultValue: false,
            props: {
              label: IndicatorCard?.DisabledYoy ?? 'Disable YoY'
            }
          },

          {
            className,
            key: 'disabledTrend',
            type: 'checkbox',
            defaultValue: false,
            props: {
              label: IndicatorCard?.DisabledTrend ?? 'Disable Trend'
            }
          },
          {
            className,
            key: 'lookBack',
            type: 'input-inline',
            props: {
              label: IndicatorCard?.LookBack ?? 'Look Back',
              type: 'number',
              placeholder: 12
            }
          },
          {
            className,
            key: 'digitsInfo',
            type: 'input-inline',
            props: {
              label: IndicatorCard?.DigitsInfo ?? 'DigitsInfo',
              placeholder: '0.0-1',
            }
          }
        ]
      },
      {
        className: FORMLY_W_FULL,
        key: 'indicators',
        type: 'table-inline',
        props: {
          title: IndicatorCard?.Indicators ?? 'Indicators'
        },
        fieldArray: {
          fieldGroup: [
            {
              key: 'code',
              type: 'select-inline',
              className: 'w-64',
              props: {
                title: IndicatorCard?.Indicator ?? 'Indicator',
                options: this.indicatorSelectOptions$,
                searchable: true,
                displayBehaviour: DisplayBehaviour.auto,
              }
            },
            {
              key: 'title',
              type: 'input-inline',
              props: {
                title: IndicatorCard?.Alias ?? 'Alias',
                appearance: 'standard'
              }
            },
            {
              key: 'yoyType',
              type: 'select-inline',
              hideExpression: `!model || model.disabledYoy !== false`,
              props: {
                title: IndicatorCard?.YoYType ?? 'YoY Type',
                appearance: 'standard',
                options: [
                  {
                    value: YoyType.PROPORTION,
                    label: '比例'
                  },
                  {
                    value: YoyType.GAP,
                    label: '差值'
                  }
                ]
              }
            },
            {
              key: 'disabledYoy',
              type: 'checkbox',
              defaultValue: false,
              props: {
                title: IndicatorCard?.DisabledYoy ?? 'Disable YoY'
              }
            },
            {
              key: 'digitsInfo',
              type: 'input-inline',
              props: {
                title: IndicatorCard?.DigitsInfo ?? 'DigitsInfo',
                placeholder: '1.0-1',
                appearance: 'standard'
              }
            }
          ]
        }
      }
    ]
  }
}
