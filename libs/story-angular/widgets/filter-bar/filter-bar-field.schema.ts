import { Injectable } from '@angular/core'
import { FormlyFieldConfig } from '@ngx-formly/core'
import { ControlType } from '@xpert-ai/core'
import { FilterControlType } from '@xpert-ai/story/core'
import {
  DataSettingsSchemaService,
  DataTable,
  dateFilterOptions,
  filterAttributes,
  FORMLY_ROW,
  FORMLY_W_1_2,
  FORMLY_W_FULL,
  SchemaState,
  SelectionType,
  Size
} from '@xpert-ai/story/designer'
import { combineLatest } from 'rxjs'
import { map } from 'rxjs/operators'

@Injectable()
export class FilterBarFieldSchemaService<T extends SchemaState = SchemaState> extends DataSettingsSchemaService<T> {
  getSchema() {
    return combineLatest([this.translate.stream('Story'), this.translate.stream('DateVariable')]).pipe(
      map(([STORY_DESIGNER, DateVariable]) => {
        this.STORY_DESIGNER = STORY_DESIGNER
        return [
          {
            type: 'tabs',
            fieldGroup: [
              {
                props: {
                  label: STORY_DESIGNER?.Common?.Builder ?? 'Builder',
                  icon: 'handyman'
                },
                fieldGroup: this.getBuilderSchema(STORY_DESIGNER.Widgets, DateVariable)
              },
              {
                key: 'styling',
                props: {
                  label: STORY_DESIGNER?.Common?.Styling ?? 'Styling',
                  icon: 'format_paint'
                },
                fieldGroup: this.getStylingSchema(STORY_DESIGNER)
              }
            ]
          }
        ]
      })
    )
  }

  getBuilderSchema(Widgets, DateVariable) {
    return [
      {
        wrappers: ['panel'],
        props: {
          padding: true
        },
        fieldGroupClassName: FORMLY_ROW,
        fieldGroup: [
          {
            className: FORMLY_W_1_2,
            key: 'controlType',
            type: 'select',
            props: {
              label: Widgets?.FilterBar?.ControlType?.Title ?? 'Control Type',
              options: [
                {
                  value: null,
                  label: Widgets?.FilterBar?.ControlType?.Auto ?? 'Auto'
                },
                {
                  value: FilterControlType.TreeSelect,
                  label: Widgets?.FilterBar?.ControlType?.TreeSelect ?? 'Tree Select'
                },
                // {
                //   value: FilterControlType.Select,
                //   label: Widgets?.FilterBar?.ControlType?.Select ?? 'Select'
                // },
                {
                  value: ControlType.dropDownList,
                  label: Widgets?.FilterBar?.ControlType?.DropDownList ?? 'DropDownList'
                },
                {
                  value: FilterControlType.Datepicker,
                  label: Widgets?.FilterBar?.ControlType?.Datepicker ?? 'Datepicker'
                }
              ]
            }
          }
        ]
      },

      {
        key: 'options',
        wrappers: ['panel'],
        props: {
          padding: true,
          label: Widgets?.FilterBar?.ControlOptions ?? 'Control Options'
        },
        fieldGroup: this.getOptionsFieldGroup(this.STORY_DESIGNER, DateVariable)
      }
    ]
  }

  getOptionsFieldGroup(STORY_DESIGNER, DateVariable) {
    const className = FORMLY_W_1_2
    const treeSelectExpression = (model: any, formState: any, field: FormlyFieldConfig) => {
      return field.parent.parent.form.value?.controlType !== 'TreeSelect'
    }
    const memberSelectExpression = (model: any, formState: any, field: FormlyFieldConfig) => {
      return field.parent.parent.form.value?.controlType !== FilterControlType.Select
    }
    return [
      {
        fieldGroupClassName: 'ngm-formly__row',
        fieldGroup: [
          ...filterAttributes(className, STORY_DESIGNER?.Common),
          {
            hideExpression: treeSelectExpression,
            className,
            key: 'initialLevel',
            type: 'slider',
            props: {
              label: STORY_DESIGNER?.Widgets?.Filter?.InitialLevel ?? 'Initial Level',
              type: 'number',
              thumbLabel: true,
              max: 10
            }
          },
          // {
          //   hideExpression: treeSelectExpression,
          //   className,
          //   key: 'autocomplete',
          //   type: 'checkbox',
          //   props: {
          //     label: STORY_DESIGNER?.Widgets?.Filter?.Autocomplete ?? 'Autocomplete'
          //   }
          // },
          // {
          //   className,
          //   hideExpression: (model: any, formState: any, field: FormlyFieldConfig) => {
          //     return field.parent.parent.form.value?.controlType !== FilterControlType.TreeSelect
          //   },
          //   key: 'searchable',
          //   type: 'checkbox',
          //   props: {
          //     label: STORY_DESIGNER?.Widgets?.Filter?.Searchable ?? 'Searchable'
          //   }
          // },
          {
            hideExpression: treeSelectExpression,
            className,
            key: 'virtualScroll',
            type: 'checkbox',
            props: {
              label: STORY_DESIGNER?.Widgets?.Filter?.VirtualScroll ?? 'Virtual Scroll'
            }
          },
          {
            className,
            hideExpression: (model: any, formState: any, field: FormlyFieldConfig) => {
              return field.parent.parent.form.value?.controlType === FilterControlType.Datepicker
            },
            key: 'multiple',
            type: 'checkbox',
            props: {
              label: STORY_DESIGNER?.Widgets?.Filter?.Multiple ?? 'Multiple'
            }
          },
          {
            hideExpression: `!model || !model.multiple`,
            className,
            key: 'maxTagCount',
            type: 'input',
            props: {
              label: STORY_DESIGNER?.Widgets?.Filter?.MaxTagCount ?? 'Max Tag Count',
              type: 'number'
            }
          },
          {
            className,
            key: 'autoActiveFirst',
            type: 'checkbox',
            props: {
              label: STORY_DESIGNER?.Widgets?.Filter?.AutoActiveFirst ?? 'Auto Active First'
            }
          },
          {
            className,
            key: 'showAllMember',
            type: 'checkbox',
            props: {
              label: STORY_DESIGNER?.Widgets?.Filter?.ShowAllMember ?? 'Show All Member'
            }
          },
          {
            hideExpression: treeSelectExpression,
            className,
            key: 'panelWidth',
            type: 'slider',
            props: {
              label: STORY_DESIGNER?.Widgets?.Filter?.PanelWidth ?? 'Panel Width',
              thumbLabel: true,
              autoScale: true,
              unit: 'px'
            }
          },
          {
            hideExpression: (model: any, formState: any, field: FormlyFieldConfig) => {
              return field.parent.parent.form.value?.controlType !== ControlType.dropDownList
            },
            ...DataTable(FORMLY_W_FULL, STORY_DESIGNER?.Widgets?.Filter)
          },
          ...dateFilterOptions(this.coreService, className, STORY_DESIGNER?.Widgets?.Filter, DateVariable).map(
            (item) => ({
              ...item,
              hideExpression: (model: any, formState: any, field: FormlyFieldConfig) => {
                return field.parent.parent.form.value?.controlType !== FilterControlType.Datepicker
              }
            })
          )
        ]
      }
    ]
  }

  getStylingSchema(DESIGNER) {
    return [
      {
        wrappers: ['panel'],
        props: {
          label: DESIGNER?.STYLING?.CSS?.SIZE?.TITLE ?? 'Size',
          padding: true
        },
        fieldGroupClassName: FORMLY_ROW,
        fieldGroup: Size(FORMLY_W_1_2, DESIGNER?.STYLING?.CSS?.SIZE)
      }
    ]
  }
}

@Injectable()
export class FilterBarDateSchemaService extends FilterBarFieldSchemaService {
  getOptionsFieldGroup(STORY_DESIGNER, DateVariable) {
    const className = FORMLY_W_1_2
    return [
      {
        fieldGroupClassName: FORMLY_ROW,
        fieldGroup: [
          ...filterAttributes(className, STORY_DESIGNER?.COMMON),
          SelectionType(className, STORY_DESIGNER?.COMMON),
          ...dateFilterOptions(this.coreService, className, STORY_DESIGNER, DateVariable)
        ]
      }
    ] as any
  }
}
