import { Injectable } from '@angular/core'
import { Dimension, nonNullable } from '@xpert-ai/ocap-core'
import {
  AccordionWrappers,
  DataSettingsSchemaService,
  FORMLY_ROW,
  FORMLY_W_1_2,
  FORMLY_W_FULL,
  SchemaState,
  dateFilterOptions
} from '@xpert-ai/story/designer'
import { isEqual } from 'lodash-es'
import { Observable, combineLatest } from 'rxjs'
import { distinctUntilChanged, filter, map } from 'rxjs/operators'
import { CascadingEffect } from './types'
import { PropertyCapacity } from '@xpert-ai/ocap-angular/entity'

@Injectable()
export class StoryFilterBarSchemaService<T extends SchemaState = SchemaState> extends DataSettingsSchemaService<T> {
  readonly selectionFields$: Observable<any> = this.select((state) => state.dataSettings).pipe(
    filter(nonNullable),
    map((dataSettings) => dataSettings.selectionFieldsAnnotation),
    distinctUntilChanged(isEqual)
  )

  readonly propertyPaths$: Observable<Array<Dimension>> = this.selectionFields$.pipe(
    filter(nonNullable),
    map((selectionFields) => selectionFields.propertyPaths)
  )

  getSchema() {
    return combineLatest([this.translate.stream('Story'), this.translate.stream('DateVariable')]).pipe(
      map(([STORY_DESIGNER, DateVariable]) => {
        this.STORY_DESIGNER = STORY_DESIGNER
        const i18nStoryWidgets = STORY_DESIGNER?.Widgets

        return AccordionWrappers(
          [
            {
              key: 'dataSettings',
              label: i18nStoryWidgets?.Common?.DATA_SETTINGS ?? 'Data Settings',
              toggleable: false,
              expanded: true,
              fieldGroup: this.makeDataSettingsContent(this.STORY_DESIGNER?.Common, {
                key: 'selectionFieldsAnnotation',
                props: {
                  required: true
                },
                fieldGroup: [
                  {
                    key: 'propertyPaths',
                    type: 'array',
                    props: {
                      label: STORY_DESIGNER?.Widgets?.Common?.SELECTION_FIELDS_ANNOTATION?.DIMENSIONS ?? 'Dimensions',
                      required: true,
                      hideDelete: true
                    },
                    fieldArray: {
                      key: 'propertyPaths',
                      type: 'chart-property', // Should be `property-select` formly type
                      props: {
                        removable: true,
                        sortable: true,
                        dataSettings: this.dataSettings$,
                        entityType: this.entityType$,
                        capacities: [PropertyCapacity.Dimension, PropertyCapacity.Parameter]
                      }
                    }
                  }
                ]
              })
            },
            {
              key: 'options',
              label: i18nStoryWidgets?.FilterBar?.OPTIONS ?? 'Options',
              toggleable: false,
              expanded: true,
              fieldGroup: this.getOptions(DateVariable).fieldGroup
            }
          ],
          { expandedMulti: true }
        )
      })
    )
  }

  getOptions(DateVariable) {
    const FILTER_BAR = this.STORY_DESIGNER.Widgets?.FilterBar
    return {
      key: 'options',
      wrappers: ['accordion'],
      templateOptions: {
        label: FILTER_BAR?.OPTIONS ?? 'Options',
        expanded: true
      },
      fieldGroup: [
        {
          key: 'filters',
          type: 'empty'
        },
        {
          fieldGroupClassName: FORMLY_ROW,
          fieldGroup: [
            {
              className: FORMLY_W_1_2,
              key: 'liveMode',
              type: 'toggle',
              templateOptions: {
                label: FILTER_BAR?.LIVE_MODE ?? 'Live Mode'
              }
            },

            {
              className: FORMLY_W_1_2,
              key: 'cascadingEffect',
              type: 'toggle',
              templateOptions: {
                label: FILTER_BAR?.CascadingEffect ?? 'Cascading Effect'
              }
            },
            {
              className: FORMLY_W_1_2,
              hideExpression: `!model || !model.cascadingEffect`,
              key: 'cascadingType',
              type: 'select',
              templateOptions: {
                label: FILTER_BAR?.CascadingType ?? 'Cascading Type',
                options: [
                  { value: null, label: FILTER_BAR?.CascadingType_Default ?? 'Default' },
                  { value: CascadingEffect.InTurn, label: FILTER_BAR?.CascadingType_InTurn ?? 'In Turn' },
                  { value: CascadingEffect.All, label: FILTER_BAR?.CascadingType_All ?? 'All' }
                ]
              }
            }
          ]
        },

        {
          key: 'today',
          fieldGroup: [
            {
              className: FORMLY_W_FULL,
              key: 'enable',
              type: 'toggle',
              templateOptions: {
                label: FILTER_BAR?.EnableToday ?? 'Enable Today'
              }
            },

            {
              fieldGroupClassName: FORMLY_ROW,
              hideExpression: `!model || !model.enable`,
              fieldGroup: [
                ...dateFilterOptions(this.coreService, FORMLY_W_1_2, this.STORY_DESIGNER?.Widgets?.Filter, DateVariable)
              ]
            }
          ]
        }
      ]
    }
  }
}
