import { Injectable } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { WidgetComponentType } from '@xpert-ai/story/core'
import { DataSettingsSchemaService, FORMLY_ROW, FORMLY_W_1_2 } from '@xpert-ai/story/designer'
import { WidgetComponentType as IndicatorCardWidgetType } from '@xpert-ai/story/widgets/indicator-card'
import { FormlyFieldConfig } from '@ngx-formly/core'
import { map, startWith } from 'rxjs/operators'

@Injectable()
export class TabGroupSchemaService extends DataSettingsSchemaService {
  getSchema() {
    return this.translate.stream('Story.Widgets').pipe(
      map((i18n) => {
        const className = FORMLY_W_1_2
        return [
          {
            key: 'options',
            fieldGroup: [
              {
                fieldGroupClassName: FORMLY_ROW,
                wrappers: ['panel'],
                props: {
                  label: i18n.TabGroup?.Options ?? 'Options',
                  padding: true
                },
                fieldGroup: [
                  {
                    className,
                    key: 'disableRipple',
                    type: 'checkbox',
                    props: {
                      label: i18n.TabGroup?.DisableRipple ?? 'Disable Ripple'
                    }
                  },
                  {
                    className,
                    key: 'preserveContent',
                    type: 'checkbox',
                    props: {
                      label: i18n.TabGroup?.PreserveContent ?? 'Preserve Content'
                    }
                  },
                  {
                    className,
                    key: 'color',
                    type: 'select',
                    props: {
                      label: i18n.TabGroup?.Color ?? 'Color',
                      options: [
                        { value: null, label: 'None' },
                        { value: 'primary', label: 'Primary' },
                        { value: 'accent', label: 'Accent' },
                        { value: 'warn', label: 'Warn' }
                      ]
                    }
                  },
                  {
                    className,
                    key: 'animationDuration',
                    type: 'input',
                    props: {
                      label: i18n.TabGroup?.AnimationDuration ?? 'Animation Duration',
                      type: 'string'
                    }
                  },
                  {
                    className,
                    key: 'alignTabs',
                    type: 'select',
                    props: {
                      label: i18n.TabGroup?.AlignTabs ?? 'Align Tabs',
                      options: [
                        { value: null, label: 'None' },
                        { value: 'start', label: 'start' },
                        { value: 'center', label: 'center' },
                        { value: 'end', label: 'end' }
                      ]
                    }
                  },
                  {
                    className,
                    key: 'stretchTabs',
                    type: 'checkbox',
                    props: {
                      label: i18n.TabGroup?.StretchTabs ?? 'Stretch Tabs'
                    }
                  },
                  {
                    className,
                    key: 'headerPosition',
                    type: 'select',
                    props: {
                      label: i18n.TabGroup?.HeaderPosition ?? 'Header Position',
                      options: [
                        { value: null, label: i18n.TabGroup?.None ?? 'None' },
                        { value: 'above', label: i18n.TabGroup?.Above ?? 'Above' },
                        { value: 'below', label: i18n.TabGroup?.Below ?? 'Below' }
                      ]
                    }
                  },
                  {
                    className,
                    key: 'disablePagination',
                    type: 'checkbox',
                    props: {
                      label: i18n.TabGroup?.DisablePagination ?? 'Disable Pagination'
                    }
                  }
                ]
              },

              {
                key: 'slides',
                type: 'table-inline',
                wrappers: ['panel'],
                props: {
                  label: i18n.TabGroup?.Components ?? 'Components',
                  padding: true
                },
                fieldArray: {
                  fieldGroupClassName: 'ngm-formly__row',
                  fieldGroup: [
                    {
                      key: 'title',
                      type: 'input',
                      props: {
                        title: i18n.Common?.TITLE ?? 'Title'
                      }
                    },
                    {
                      key: 'type',
                      type: 'select',
                      props: {
                        title: i18n.Common?.ComponentType ?? 'Component Type',
                        options: [
                          {
                            value: 'AccountingStatement',
                            label: i18n?.Common?.AccountingStatement ?? 'Accounting Statement'
                          },
                          {
                            value: IndicatorCardWidgetType.IndicatorCard,
                            label: i18n?.Common?.IndicatorCard ?? 'Indicator Card'
                          },
                          {
                            value: WidgetComponentType.AnalyticalCard,
                            label: i18n?.Common?.AnalyticalCard ?? 'Analytical Card'
                          },
                          {
                            value: WidgetComponentType.AnalyticalGrid,
                            label: i18n?.Common?.AnalyticalGrid ?? 'Analytical Grid'
                          }
                          // 暂时没办法解决多层打开属性编辑器的能力
                          // { value: 'TabGroup', label: BUILDER?.Common?.TabGroup ?? 'TabGroup' }
                        ]
                      }
                    },
                    {
                      key: 'options',
                      type: 'designer',
                      defaultValue: {},
                      props: {
                        title: i18n?.TabGroup?.Details ?? 'Details',
                        liveMode: true
                      },
                      hooks: {
                        onInit: (field: FormlyFieldConfig) => {
                          field.props.designer = field.parent.formControl.valueChanges.pipe(
                            startWith(field.parent.model),
                            map((value) => value?.type),
                            takeUntilDestroyed(this.destroyRef)
                          )
                        }
                      }
                    },

                    {
                      key: 'disabled',
                      type: 'checkbox',
                      props: {
                        title: i18n?.TabGroup?.Disabled ?? 'Disabled'
                      }
                    }
                  ]
                }
              }
            ]
          }
        ]
      })
    )
  }
}
