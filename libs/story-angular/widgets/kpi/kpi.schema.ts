import { Injectable, inject } from '@angular/core'
import { PropertyCapacity } from '@metad/ocap-angular/entity'
import { NxStoryService } from '@metad/story/core'
import {
  AccordionWrappers,
  DataSettingsSchemaService,
  FORMLY_W_1_2,
  IntentNavigation,
  SelectionVariantExpansion
} from '@metad/story/designer'
import { map } from 'rxjs/operators'

@Injectable()
export class KpiSchemaService extends DataSettingsSchemaService {
  protected readonly storyService = inject(NxStoryService)

  getSchema() {
    return this.translate.stream('Story.Widgets').pipe(
      map((STORY_DESIGNER) => {
        this.STORY_DESIGNER = STORY_DESIGNER
        return this.getBuilderSchema(STORY_DESIGNER)
      })
    )
  }

  getBuilderSchema(i18nStoryWidgets?: any) {
    const BUILDER = i18nStoryWidgets?.Common
    const dataSettings = this.makeDataSettingsContent(
      i18nStoryWidgets?.Common,
      this.getKPIAnnotation(i18nStoryWidgets),
      ...SelectionVariantExpansion(BUILDER, this.dataSettings$)
    )

    return AccordionWrappers(
      [
        {
          key: 'dataSettings',
          label: i18nStoryWidgets?.Common?.DATA_SETTINGS ?? 'Data Settings',
          toggleable: false,
          expanded: true,
          fieldGroup: dataSettings
        },
        {
          key: 'options',
          label: i18nStoryWidgets?.KPI?.Options ?? 'Options',
          expanded: true,
          toggleable: false,
          fieldGroup: this.kpiOptions
        }
      ],
      { expandedMulti: true }
    )
  }

  getKPIAnnotation(BUILDER) {
    return {
      key: 'KPIAnnotation',
      wrappers: ['panel'],
      props: {
        label: BUILDER?.KPI?.MainKPI ?? 'Main KPI'
      },
      fieldGroup: [
        {
          key: 'DataPoint',
          fieldGroup: [
            {
              key: 'Title',
              type: 'input',
              props: {
                label: BUILDER?.Common?.Title ?? 'Title',
                appearance: 'fill'
              }
            },
            {
              key: 'Value',
              type: 'chart-property',
              props: {
                label: BUILDER?.KPI?.Value ?? 'Value',
                required: true,
                dataSettings: this.dataSettings$,
                entityType: this.entityType$,
                capacities: [PropertyCapacity.Measure, PropertyCapacity.MeasureAttributes],
                removeable: false
              }
            }
            // {
            //   key: 'TargetValue',
            //   type: 'chart-property',
            //   props: {
            //     label: BUILDER?.KPI?.TargetValue ?? 'Target Value',
            //     required: true,
            //     dataSettings: this.dataSettings$,
            //     entityType: this.entityType$,
            //     capacities: [PropertyCapacity.Measure, PropertyCapacity.MeasureAttributes],
            //     removeable: false
            //   }
            // }
          ]
        }
        // {
        //   key: 'AdditionalDataPoints',
        //   type: 'table-inline',
        //   props: {
        //     title: BUILDER?.KPI?.AdditionalDataPoints ?? 'Additional Data Points'
        //   },
        //   fieldArray: {
        //     fieldGroup: [
        //       {
        //         key: 'Title',
        //         type: 'input',
        //         props: {
        //           title: BUILDER?.Common?.Title ?? 'Title',
        //           appearance: 'fill'
        //         }
        //       },
        //       {
        //         key: 'Value',
        //         type: 'chart-property',
        //         props: {
        //           label: BUILDER?.KPI?.Value ?? 'Value',
        //           required: true,
        //           dataSettings: this.dataSettings$,
        //           entityType: this.entityType$,
        //           capacities: [PropertyCapacity.Measure, PropertyCapacity.MeasureAttributes],
        //           width: '200px',
        //           removeable: false
        //         }
        //       },
        //       {
        //         key: 'TargetValue',
        //         type: 'chart-property',
        //         props: {
        //           label: BUILDER?.KPI?.TargetValue ?? 'Target Value',
        //           required: true,
        //           dataSettings: this.dataSettings$,
        //           entityType: this.entityType$,
        //           capacities: [PropertyCapacity.Measure, PropertyCapacity.MeasureAttributes],
        //           width: '200px',
        //           removeable: false
        //         }
        //       }
        //     ]
        //   }
        // }
      ]
    }
  }

  get kpiOptions() {
    const BUILDER = this.STORY_DESIGNER
    const className = FORMLY_W_1_2
    return [
      {
        fieldGroupClassName: 'ngm-formly__row',
        fieldGroup: [
          {
            className,
            key: 'hideToolbar',
            type: 'checkbox',
            props: {
              label: BUILDER?.KPI?.HideToolbar ?? 'Hide Toolbar'
            }
          },
          {
            className,
            key: 'shortNumber',
            type: 'checkbox',
            props: {
              label: BUILDER?.KPI?.ShortNumber ?? 'Short Number'
            }
          },
          {
            className,
            key: 'digitsInfo',
            type: 'input',
            props: {
              label: BUILDER?.KPI?.DigitsInfo ?? 'Digits Info',
              placeholder: `Eg. 0.0-2`
            }
          },
          {
            className,
            key: 'unit',
            type: 'input',
            props: {
              label: BUILDER?.KPI?.Unit ?? 'Unit'
            }
          },
          {
            className,
            key: 'unitSemantics',
            type: 'select',
            props: {
              label: BUILDER?.KPI?.UnitSemantics ?? 'Unit Semantics',
              options: [
                {
                  value: 'currency-code',
                  label: BUILDER?.KPI?.CurrencyCode ?? 'Currency Code'
                },
                {
                  value: 'unit-of-measure',
                  label: BUILDER?.KPI?.UnitOfMeasure ?? 'Unit of Measure'
                }
              ]
            }
          },
          {
            className,
            key: 'showDeviation',
            type: 'checkbox',
            props: {
              label: BUILDER?.KPI?.ShowDeviation ?? 'Show Deviation'
            }
          },
          {
            className,
            key: 'deviationText',
            type: 'input',
            props: {
              label: BUILDER?.KPI?.DeviationText ?? 'Deviation Text'
            }
          },
          {
            className,
            key: 'nanPlaceholder',
            type: 'input',
            props: {
              label: BUILDER?.KPI?.NanPlaceholder ?? 'Nan Placeholder Text'
            }
          }
        ]
      },
      IntentNavigation(className, BUILDER, this.storyService)
    ]
  }
}
