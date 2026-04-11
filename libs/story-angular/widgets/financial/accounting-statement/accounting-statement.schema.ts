import { Injectable } from '@angular/core'
import { DisplayBehaviour, PeriodFunctions } from '@xpert-ai/ocap-core'
import { DataSettingsSchemaService, FORMLY_W_1_2 } from '@xpert-ai/story/designer'
import { map } from 'rxjs/operators'

@Injectable()
export class AccountingStatementSchemaService extends DataSettingsSchemaService {

  getSchema() {
    return this.translate.stream('STORY_DESIGNER').pipe(
      map((STORY_DESIGNER) => {
        this.STORY_DESIGNER = STORY_DESIGNER
        const BUILDER = STORY_DESIGNER?.BUILDER

        const className = FORMLY_W_1_2

        const dataSettings = this.generateDataSettingsSchema(BUILDER)
        dataSettings.wrappers = []

        return [
          {
            wrappers: ['panel'],
            props: {
              padding: true
            },
            fieldGroup: [
              dataSettings,
              {
                key: 'options',
                props: {
                  label: BUILDER?.AccountingStatement?.Options ?? 'Options'
                },
                fieldGroup: [
                  {
                    fieldGroupClassName: 'ngm-formly__row',
                    fieldGroup: [
                      {
                        className,
                        key: 'name',
                        type: 'input',
                        props: {
                          label: BUILDER?.AccountingStatement?.TableName ?? 'Table Name',
                          appearance: 'standard'
                        }
                      },
                      {
                        className,
                        key: 'denominator',
                        type: 'number',
                        props: {
                          label: BUILDER?.AccountingStatement?.Denominator ?? 'Denominator',
                          appearance: 'standard'
                        }
                      },
                      {
                        className,
                        key: 'unit',
                        type: 'input',
                        props: {
                          label: BUILDER?.AccountingStatement?.DenominatorUnit ?? 'Unit',
                          appearance: 'standard'
                        }
                      },
                      {
                        className,
                        key: 'digitsInfo',
                        type: 'input',
                        props: {
                          label: BUILDER?.AccountingStatement?.DigitsInfo ?? 'Digits Info',
                          appearance: 'standard'
                        }
                      },
                    ]
                  },
                  {
                    className: 'ngm-formly__col ngm-formly__col-12',
                    key: 'measures',
                    type: 'table-inline',
                    props: {
                      title: BUILDER?.AccountingStatement?.MeasuresOptions ?? 'Measures Options',
                    },
                    fieldArray: {
                      fieldGroup: [
                        {
                          key: 'name',
                          type: 'select-inline',
                          props: {
                            title: BUILDER?.AccountingStatement?.Measure ?? 'Measure',
                            appearance: 'fill',
                            options: [
                              { value: PeriodFunctions.CURRENT, label: BUILDER?.AccountingStatement?.PeriodFunctionsCURRENT ?? 'Current' },
                              { value: PeriodFunctions.YTD, label: BUILDER?.AccountingStatement?.PeriodFunctionsYTD ?? 'YTD' },
                              { value: PeriodFunctions.PYSM, label: BUILDER?.AccountingStatement?.PeriodFunctionsPYSM ?? 'PYSM' },
                              { value: PeriodFunctions.MPM, label: BUILDER?.AccountingStatement?.PeriodFunctionsMPM ?? 'Prior Period' },
                              { value: PeriodFunctions.YOY, label: BUILDER?.AccountingStatement?.PeriodFunctionsYOY ?? 'YOY' },
                              { value: PeriodFunctions.MOM, label: BUILDER?.AccountingStatement?.PeriodFunctionsMOM ?? 'MOM' }
                            ]
                          }
                        },
                        {
                          key: 'label',
                          type: 'input-inline',
                          props: {
                            title: BUILDER?.AccountingStatement?.ColumnName ?? 'Column Name',
                            appearance: 'standard',
                          }
                        },
                        {
                          key: 'isRatio',
                          type: 'checkbox',
                          props: {
                            title: BUILDER?.AccountingStatement?.IsRatio ?? 'Is Ratio'
                          }
                        },
                        {
                          key: 'isSemanticColor',
                          type: 'checkbox',
                          props: {
                            title: BUILDER?.AccountingStatement?.IsSemanticColor ?? 'Is Semantic Color'
                          }
                        },
                        {
                          key: 'reverseSemanticColor',
                          type: 'checkbox',
                          props: {
                            title: BUILDER?.AccountingStatement?.ReverseSemanticColor ?? 'Reverse Color'
                          }
                        }
                      ]
                    }
                  },
                  {
                    key: 'indicators',
                    type: 'table',
                    props: {
                      title: BUILDER?.AccountingStatement?.Indicators ?? 'Indicators',
                    },
                    fieldArray: {
                      fieldGroup: [
                        {
                          key: 'id',
                          type: 'select-inline',
                          props: {
                            title: BUILDER?.AccountingStatement?.Indicator ?? 'Indicator',
                            searchable: true,
                            appearance: 'standard',
                            displayBehaviour: DisplayBehaviour.auto,
                            options: this.indicatorSelectOptions$
                          }
                        },
                        {
                          key: 'name',
                          type: 'input-inline',
                          props: {
                            title: BUILDER?.AccountingStatement?.IndicatorAlias ?? 'Alias',
                          }
                        },
                        {
                          key: 'groupName',
                          type: 'input-inline',
                          props: {
                            title: BUILDER?.AccountingStatement?.GroupName ?? 'Group Name',
                          }
                        },
                        {
                          key: 'digitsInfo',
                          type: 'input-inline',
                          props: {
                            title: BUILDER?.AccountingStatement?.DigitsInfo ?? 'Digits Info',
                          }
                        },
                        {
                          key: 'digitsUnit',
                          type: 'input-inline',
                          props: {
                            title: BUILDER?.AccountingStatement?.DigitsUnit ?? 'Digits Unit',
                          }
                        },
                        {
                          key: 'isItalic',
                          type: 'checkbox',
                          props: {
                            title: BUILDER?.AccountingStatement?.IsItalic ?? 'Is Italic'
                          }
                        },
                        {
                          key: 'isUnderline',
                          type: 'checkbox',
                          props: {
                            title: BUILDER?.AccountingStatement?.IsUnderline ?? 'Is Underline'
                          }
                        },
                        {
                          key: 'reverseSemanticColor',
                          type: 'checkbox',
                          props: {
                            title: BUILDER?.AccountingStatement?.ReverseSemanticColor ?? 'Reverse Color'
                          }
                        }
                      ]
                    }
                  }
                ]
              }
            ]
          }
        ]
      })
    )
  }

}
