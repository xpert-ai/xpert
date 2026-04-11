import { Injectable } from '@angular/core'
import { DataSettings, EntityType } from '@xpert-ai/ocap-core'
import { ColorPalettes } from '@xpert-ai/core'
import {
  AccordionWrappers,
  DataSettingsSchemaService,
  FORMLY_GAP_2,
  FORMLY_MY_2,
  FORMLY_ROW,
  FORMLY_W_1_2,
  PresentationVariantExpansion,
  SelectionVariantExpansion,
} from '@xpert-ai/story/designer'
import { Observable } from 'rxjs'
import { map, tap } from 'rxjs/operators'
import { PropertyCapacity } from '@xpert-ai/ocap-angular/entity'

@Injectable()
export class AnalyticalGridSchemaService extends DataSettingsSchemaService {

  getSchema() {
    return this.translate.stream('Story').pipe(
      tap((i18n) => this.STORY_DESIGNER = i18n),
      map(() => this.getBuilderSchema())
    )
  }

  getBuilderSchema() {
    const Widgets = this.STORY_DESIGNER.Widgets

    const dataSettings = this.generateDataSettingsSchema(
      Widgets?.Common,
      AnalyticsAnnotationSchema(Widgets, this.dataSettings$, this.entityType$),
      ...SelectionVariantExpansion(Widgets?.Common, this.dataSettings$),
      ...PresentationVariantExpansion(Widgets?.Common, this.dataSettings$, this.entityType$, this.properties$),
    )

    
    return [
      {
        wrappers: ['panel'],
        props: {
          padding: true
        },
        fieldGroup: [
          {
            key: 'title',
            type: 'input',
            props: {
              label: Widgets?.Common?.Title ?? 'Title',
              // required: true
            }
          }
        ]
      },
      ...AccordionWrappers([
        {
          key: 'dataSettings',
          label: Widgets?.Common?.DATA_SETTINGS ?? 'Data Settings',
          toggleable: false,
          expanded: true,
          fieldGroup: dataSettings.fieldGroup[0].fieldGroup
        },
      ], {expandedMulti: true}),
      ...getGridOptionsSchema(Widgets)
    ] as any
  }
}

/**
 * {@link WidgetAnalyticalGridOptions}
 * 
 * @param Widgets i18n Widgets in Story
 * @returns 
 */
export function getGridOptionsSchema(Widgets: any) {
  const className = FORMLY_W_1_2
  return AccordionWrappers([
    {
      key: 'options',
      label: Widgets?.AnalyticalGrid?.GridOptions ?? 'Grid Options',
      toggleable: false,
      expanded: true,
      fieldGroup: [
        {
          fieldGroupClassName: FORMLY_ROW,
          fieldGroup: [
            {
              className,
              key: 'showToolbar',
              type: 'checkbox',
              props: {
                label: Widgets?.AnalyticalGrid?.showToolbar ?? 'Show Toolbar'
              }
            },
            {
              
              className,
              key: 'hideDataDownload',
              type: 'checkbox',
              props: {
                label: Widgets?.AnalyticalGrid?.HideDataDownload ?? 'Hide Data Download'
              }
            },
            {
              className,
              key: 'strip',
              type: 'checkbox',
              props: {
                label: Widgets?.AnalyticalGrid?.Strip ?? 'Strip'
              }
            },
            {
              className,
              key: 'grid',
              type: 'checkbox',
              props: {
                label: Widgets?.AnalyticalGrid?.Grid ?? 'Grid'
              }
            },
            {
              className,
              key: 'sticky',
              type: 'checkbox',
              props: {
                label: Widgets?.AnalyticalGrid?.TableHeaderSticky ?? 'Table Header Sticky'
              }
            },
            {
              className,
              key: 'sortable',
              type: 'checkbox',
              props: {
                label: Widgets?.AnalyticalGrid?.Sortable ?? 'Sortable'
              }
            },
            {
              className,
              key: 'selectable',
              type: 'checkbox',
              props: {
                label: Widgets?.AnalyticalGrid?.ColumnSelectable ?? 'Column Selectable'
              }
            },
          ]
        },

        {
          fieldGroupClassName: FORMLY_ROW,
          fieldGroup: [
            {
              className,
              key: 'paging',
              type: 'checkbox',
              props: {
                label: Widgets?.AnalyticalGrid?.Paging ?? 'Paging'
              }
            },
            {
              className,
              key: 'pageSize',
              type: 'input',
              props: {
                type: 'number',
                label: Widgets?.AnalyticalGrid?.PageSize ?? 'Page Size'
              }
            },

            {
              className,
              key: 'initialRowLevel',
              type: 'input',
              props: {
                label: Widgets?.AnalyticalGrid?.InitialRowLevel ?? 'Initial Row Level',
                type: 'number'
              }
            },
            {
              className,
              key: 'initialColumnLevel',
              type: 'input',
              props: {
                label: Widgets?.AnalyticalGrid?.InitialColumnLevel ?? 'Initial Column Level',
                type: 'number'
              }
            },

            {
              className,
              key: 'digitsInfo',
              type: 'input',
              props: {
                label: Widgets?.AnalyticalGrid?.DigitsInfo ?? 'Digits Info',
              }
            },
            {
              className,
              key: 'unit',
              type: 'input',
              props: {
                label: Widgets?.AnalyticalGrid?.Unit ?? 'Unit',
              }
            },
            {
              className,
              key: 'currencyCode',
              type: 'input',
              props: {
                label: Widgets?.AnalyticalGrid?.CurrencyCode ?? 'Currency Code',
              }
            }
          ]
        }
      ]
    },
  ])
}

export function AnalyticsAnnotationSchema(Widgets, dataSettings$: Observable<DataSettings>, entityType$: Observable<EntityType>) {
  return {
    key: 'analytics',
    fieldGroupClassName: FORMLY_GAP_2 + ' ' + FORMLY_MY_2,
    fieldGroup: [
      {
        key: 'rows',
        type: 'array',
        props: {
          label: Widgets?.AnalyticalGrid?.Rows ?? 'Rows',
          hideDelete: true
        },
        fieldArray: {
          type: 'chart-property',
          props: {
            required: true,
            removable: true,
            sortable: true,
            dataSettings: dataSettings$,
            entityType: entityType$,
            capacities: [
              PropertyCapacity.Dimension,
              PropertyCapacity.MeasureGroup,
              PropertyCapacity.Measure,
              PropertyCapacity.MeasureAttributes,
              PropertyCapacity.Order,
              PropertyCapacity.MeasureStyle,
              PropertyCapacity.MeasureStylePalette,
            ],
            colors: ColorPalettes
          }
        }
      },
      {
        key: 'columns',
        type: 'array',
        props: {
          label: Widgets?.AnalyticalGrid?.Columns ?? 'Columns',
          hideDelete: true
        },
        fieldArray: {
          type: 'chart-property',
          props: {
            required: true,
            removable: true,
            sortable: true,
            dataSettings: dataSettings$,
            entityType: entityType$,
            capacities: [
              PropertyCapacity.Dimension,
              PropertyCapacity.MeasureGroup,
              PropertyCapacity.Measure,
              PropertyCapacity.MeasureAttributes,
              PropertyCapacity.Order,
              PropertyCapacity.MeasureStyle,
              PropertyCapacity.MeasureStylePalette,
              PropertyCapacity.MeasureStyleGridBar,
            ],
            colors: ColorPalettes
          }
        }
      }
    ]
  }
}
