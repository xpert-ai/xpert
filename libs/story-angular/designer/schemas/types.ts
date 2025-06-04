import { TypeAheadType } from '@metad/core'
import { DisplayDensity, ISelectOption, NgmOcapCoreService, TIME_GRANULARITY_SEQUENCES } from '@metad/ocap-angular/core'
import { DataSource, FilterSelectionType, isNil } from '@metad/ocap-core'
import { FormlyFieldConfig } from '@ngx-formly/core'
import { Observable, combineLatest, throwError } from 'rxjs'
import { catchError, map, switchMap, tap } from 'rxjs/operators'

export const FORMLY_W_FULL = 'ngm-formly__col ngm-formly__col-12'
export const FORMLY_W_1_3 = 'ngm-formly__col ngm-formly__col-4'
export const FORMLY_W_2_3 = 'ngm-formly__col ngm-formly__col-8'
export const FORMLY_W_1_2 = 'ngm-formly__col ngm-formly__col-6'
export const FORMLY_W_NONE = 'ngm-formly__col_none'
export const FORMLY_ROW = 'ngm-formly__row'
export const FORMLY_MY_2 = 'ngm-formly__my-2'
export const FORMLY_GAP_2 = 'ngm-formly__gap-2'

export type TAccordionWrapperExpansion = {
  key: string
  label: string
  type?: string
  fieldGroup?: any[]
  fieldGroupClassName?: string
  fieldArray?: any
  showKey?: string
  expanded?: boolean
  toggleable?: boolean
  props?: Record<string, any>
}

export function AccordionWrappers(
  expansions: TAccordionWrapperExpansion[],
  options?: {
    expandedMulti?: boolean
  }
) {
  return [
    ...expansions.map(({ key, showKey }) => ({
      key: showKey ?? `__show${key}__`,
      type: 'empty'
    })),
    {
      wrappers: ['accordion'],
      props: {
        elevationZ: true,
        expandedMulti: options?.expandedMulti ?? false
      },
      fieldGroup: [
        ...expansions.map(({ key, type, label, showKey, fieldGroup, fieldGroupClassName, fieldArray, expanded, toggleable, props }) => {
          showKey = showKey ?? `__show${key}__`
          const expansion = {
            key,
            type,
            props: {
              ...(props ?? {}),
              label,
              keyShow: showKey,
              expanded
            },
            fieldGroup,
            fieldGroupClassName,
            fieldArray,
            expressions: {}
          } as any
          if (isNil(toggleable) || toggleable) {
            const expression = `!field.parent.model || (field.parent.model.${showKey} == null ? !field.parent.model.${key} : !field.parent.model.${showKey})`
            expansion.expressions.hide = expression
            expansion.hideExpression = expression
          }
          return expansion
        })
      ]
    }
  ]
}


/**
 * @deprecated use `makeDataSettingsContent` instead
 */
export function DataSettingsSchema(
  BUILDER,
  dataSources$: Observable<ISelectOption[]>,
  dataSource$: Observable<DataSource>,
  ...fieldGroups
) {
  return {
    wrappers: ['accordion'],
    props: {
      elevationZ: true,
    },
    fieldGroup: [
      {
        key: 'dataSettings',
        props: {
          label: BUILDER?.DATA_SETTINGS ?? 'Data Settings',
          required: true,
          expanded: true
        },
        fieldGroup: [
          {
            fieldGroupClassName: FORMLY_ROW,
            fieldGroup: [
              {
                key: 'dataSource',
                type: 'semantic-model',
                className: FORMLY_W_1_2,
                props: {
                  label: BUILDER?.SemanticModel ?? 'Semantic Model',
                  required: true,
                  options: dataSources$,
                  panelWidth: '300px',
                }
              },
              {
                key: 'entitySet',
                type: 'ngm-select',
                className: FORMLY_W_1_2,
                props: {
                  label: BUILDER?.Entity ?? 'Entity',
                  searchable: true,
                  required: true,
                  panelWidth: '300px',
                },
                expressions: {
                  hide: `!model || !model.dataSource`
                },
                hooks: {
                  onInit: (field: FormlyFieldConfig) => {
                    if (!(field.className && field.className.indexOf('formly-loader') > -1)) {
                      field.className = `${field.className} formly-loader`
                    }
                    field.props.options = dataSource$.pipe(
                      tap(() => {
                        field.className = field.className.includes('formly-loader')
                          ? field.className
                          : `${field.className} formly-loader`
                      }),
                      switchMap((dataSource: DataSource) =>
                        combineLatest([
                          dataSource.discoverMDCubes(), //.pipe(tap((options) => console.warn(options))),
                          dataSource.selectSchema() //.pipe(tap((options) => console.warn(options)))
                        ])
                      ),
                      map(([cubes, schema]) => {
                        return cubes.map((cube: any) => ({
                          value: cube.name,
                          label: cube.caption,
                          // @todo
                          icon: schema?.cubes?.find((item) => item.name === cube.name)
                            ? 'star_outline'
                            : cube.cubeType === 'VIRTUAL CUBE'
                            ? 'dataset_linked'
                            : null,
                          fontSet: 'material-icons-outlined'
                        }))
                      }),
                      catchError((err) => {
                        field.className = field.className.split('formly-loader').join('')
                        return throwError(() => err)
                      }),
                      tap(() => (field.className = field.className.split('formly-loader').join('')))
                    )
                  }
                }
              }
            ]
          },
          ...fieldGroups
        ]
      }
    ]
  }
}

export function filterAttributes(className: string, COMMON) {
  return [
    {
      className,
      key: 'label',
      type: 'input',
      props: {
        label: COMMON?.Label ?? 'Label'
      }
    },
    {
      className,
      key: 'placeholder',
      type: 'input',
      props: {
        label: COMMON?.Placeholder ?? 'Placeholder'
      }
    }
  ]
}

/**
 * Attributes schema for hierarchy
 *
 * @param COMMON
 * @returns
 */
export function hierarchyAttributes(COMMON?) {
  return [
    {
      className: FORMLY_W_1_2,
      key: 'initialLevel',
      type: 'slider',
      props: {
        label: COMMON?.initialHierarchyLevel ?? 'Initial Hierarchy Level',
        type: 'number',
        max: 10,
        thumbLabel: true
      }
    },
    {
      className: FORMLY_W_1_2,
      key: 'showAllMember',
      type: 'checkbox',
      props: {
        label: COMMON?.ShowAllMember ?? 'Show All Member'
      }
    }
  ]
}

export function typeAhead(COMMON) {
  return {
    fieldGroupClassName: FORMLY_ROW,
    key: 'typeAhead',
    wrappers: ['panel'],
    props: { label: '自动补全' },
    fieldGroup: [
      {
        className: FORMLY_W_1_2,
        key: 'type',
        type: 'select',
        props: {
          label: 'Value',
          options: [
            { label: 'Non', value: null },
            { label: 'Local', value: TypeAheadType.Local },
            { label: 'Remote', value: TypeAheadType.Remote }
          ]
        }
      },
      {
        className: FORMLY_W_1_2,
        key: 'required',
        type: 'checkbox',
        props: { label: '必输' }
      }
    ]
  }
}

export function SelectionType(className: string, I18N) {
  return {
    key: 'selectionType',
    type: 'select',
    className,
    props: {
      label: I18N?.Common?.SelectionType ?? 'Selection Type',
      options: [
        {
          value: FilterSelectionType.Single,
          label: I18N?.Common?.SingleValue ?? 'Single Value'
        },
        {
          value: FilterSelectionType.Multiple,
          label: I18N?.Common?.MultiValue ?? 'Multi Value'
        },
        // 暂不支持
        // {
        //   value: FilterSelectionType.SingleInterval,
        //   label: I18N?.COMMON?.SingleInterval ?? 'Single Interval'
        // },
        {
          value: FilterSelectionType.SingleRange,
          label: I18N?.Common?.SingleRange ?? 'Single Range'
        }
      ]
    }
  }
}

export function filterOption(className: string, DESIGNER) {
  return [
    {
      fieldGroupClassName: FORMLY_ROW,
      fieldGroup: [
        SelectionType(className, DESIGNER),
        {
          hideExpression: `!model || model.selectionType !== 'Multiple'`,
          className,
          key: 'maxTagCount',
          type: 'input',
          props: {
            label: DESIGNER?.COMMON?.MaxTagCount ?? 'Max Tag Count',
            type: 'number'
          }
        },
        {
          className,
          key: 'autoActiveFirst',
          type: 'checkbox',
          props: {
            label: DESIGNER?.COMMON?.AutoActiveFirst ?? 'Auto Active First'
          }
        },
        {
          className,
          key: 'searchable',
          type: 'checkbox',
          props: {
            label: DESIGNER?.COMMON?.Searchable ?? 'Searchable'
          }
        },
        {
          className,
          key: 'cascadingEffect',
          type: 'checkbox',
          props: {
            label: DESIGNER?.COMMON?.CascadingEffect ?? 'Cascading Effect'
          }
        }
      ]
    }
  ]
}

export function DataTable(className: string, I18N) {
  return {
    className,
    key: 'data',
    type: 'table-inline',
    props: {
      label: I18N?.USER_DEFINED_DATA ?? 'User Defined Values',
      title: I18N?.USER_DEFINED_DATA ?? 'User Defined Values'
    },
    fieldArray: {
      fieldGroup: [
        {
          key: 'value',
          type: 'input-inline',
          props: {
            title: I18N?.Value ?? 'Value'
          }
        },
        {
          key: 'label',
          type: 'input-inline',
          props: { title: I18N?.Label ?? 'Label' }
        }
      ]
    }
  }
}

export function dateFilterOptions(coreService: NgmOcapCoreService, className: string, I18N, DateVariable) {
  return [
    {
      className,
      key: 'granularity',
      type: 'select',
      props: {
        label: I18N?.Granularity ?? 'Granularity',
        options: [
          { label: I18N?.Year ?? 'Year', value: 'Year' },
          { label: I18N?.Quarter ?? 'Quarter', value: 'Quarter' },
          { label: I18N?.Month ?? 'Month', value: 'Month' },
          { label: I18N?.Day ?? 'Day', value: 'Day' }
        ]
      }
    },
    {
      className,
      key: 'granularitySequence',
      type: 'select',
      props: {
        label: I18N?.GranularitySequence ?? 'Granularity Sequence',
        options: Object.entries(TIME_GRANULARITY_SEQUENCES).map(([key, value]) => {
          const label = value.map((label) => I18N?.[label] ?? label).join(',')
          return {
            value: key,
            label
          }
        })
      }
    },
    {
      className,
      key: 'formatter',
      type: 'input',
      props: {
        label: I18N?.TimeFormatter ?? 'Formatter',
        placeholder: `yyyyMM/yyyyMMdd/yyyy'Q'Q`
      }
    },
    {
      className,
      key: 'defaultValue',
      type: 'select',
      props: {
        label: I18N?.DefaultTimeFunction ?? 'Default Time Function',
        options: [
          {
            value: null,
            label: I18N?.DefaultTimeFunction_None ?? 'None'
          },
          ...coreService.getDateVariables().map((item) => ({
            value: item.id,
            label: DateVariable?.[item.id] ?? item.id
          }))
        ]
      }
    },
    {
      className,
      key: 'defaultValue',
      type: 'input',
      props: {
        label: I18N?.DefaultTime ?? 'Default Time',
        placeholder: 'YYYY-MM-DD'
      }
    }
  ]
}

export function BackgroundProperties(className?: string, TRANSLATE?) {
  return [
    {
      className: FORMLY_W_FULL,
      key: 'background',
      type: 'input-inline',
      props: {
        label: TRANSLATE?.Background ?? 'Background',
        placeholder: 'background'
      }
    },
    {
      className: FORMLY_W_FULL,
      key: 'background-image',
      type: 'input-inline',
      props: {
        label: TRANSLATE?.BackgroundImage ?? 'Background Image',
        placeholder: 'background-image'
      }
    },
    {
      className,
      key: 'background-color',
      type: 'color',
      props: {
        label: TRANSLATE?.BackgroundColor ?? 'Background Color',
        placeholder: 'background-color'
      }
    },
    {
      className,
      key: 'background-position',
      type: 'input-inline',
      props: {
        label: TRANSLATE?.BackgroundPosition ?? 'Background Position',
        placeholder: 'background-position'
      }
    },
    {
      className,
      key: 'background-size',
      type: 'input-inline',
      props: {
        label: TRANSLATE?.BackgroundSize ?? 'Background Size',
        placeholder: 'background-size'
      }
    },
    {
      className,
      key: 'background-repeat',
      type: 'input-inline',
      props: {
        label: TRANSLATE?.BackgroundRepeat ?? 'Background Repeat',
        placeholder: 'background-repeat',
        options: [
          {
            value: 'no-repeat',
            label: 'No Repeat'
          }
        ]
      }
    },
    {
      className,
      key: 'background-attachment',
      type: 'select-inline',
      props: {
        label: TRANSLATE?.BackgroundAttachment ?? 'Background Attachment',
        placeholder: 'background-attachment',
        options: [
          {
            value: null,
            label: TRANSLATE?.None ?? 'None'
          },
          {
            value: 'scroll',
            label: 'Scroll'
          },
          {
            value: 'fixed',
            label: 'Fixed'
          },
          {
            value: 'local',
            label: 'Local'
          },
          {
            value: 'local, scroll',
            label: 'Local, Scroll'
          },
          {
            value: 'scroll, local',
            label: 'Scroll, Local'
          }
        ]
      }
    },
    {
      className,
      key: 'backdrop-filter',
      type: 'input-inline',
      props: {
        label: TRANSLATE?.BackdropFilter ?? 'Backdrop Filter',
        placeholder: 'backdrop-filter'
      }
    },
    {
      className: FORMLY_W_FULL,
      key: 'opacity',
      type: 'slider',
      props: {
        label: TRANSLATE?.Opacity ?? 'Opacity',
        placeholder: 'opacity',
        min: 0,
        max: 1,
        step: 0.01
      }
    }
  ]
}

export function Layout(col?: number, TRANSLATE?) {
  let className = null
  if (col) {
    className = `ngm-formly__col ngm-formly__col-${col}`
  }

  return [
    {
      className,
      key: 'margin',
      type: 'input',
      props: {
        label: TRANSLATE?.Margin ?? 'Margin',
        placeholder: 'margin'
      }
    },
    {
      className,
      key: 'padding',
      type: 'input',
      props: {
        label: TRANSLATE?.Padding ?? 'Padding',
        placeholder: 'padding'
      }
    },

    {
      className,
      key: 'overflow',
      type: 'input',
      props: {
        label: TRANSLATE?.Overflow ?? 'Overflow',
        placeholder: 'overflow'
      }
    }
  ]
}

export function FontCss(className: string, TRANSLATE) {
  return [
    {
      className,
      key: 'font-size',
      type: 'input-inline',
      props: {
        label: TRANSLATE?.FontSize ?? 'Font Size',
        placeholder: 'font-size'
      }
    },
    {
      className,
      key: 'color',
      type: 'color',
      props: {
        label: TRANSLATE?.FontColor ?? 'Font Color',
        placeholder: 'color'
      }
    },
    {
      className,
      key: 'font-family',
      type: 'select-inline',
      props: {
        label: TRANSLATE?.FontFamily ?? 'Font Family',
        placeholder: 'font-family',
        options: [
          { value: null, label: TRANSLATE?.None ?? 'None' },
          { value: '宋体', label: TRANSLATE?.FontFamily_Song ?? 'Song' },
          { value: '黑体', label: '黑体' },
          { value: '楷体', label: '楷体' },
          { value: '微软雅黑', label: '微软雅黑' }
        ]
      }
    },
    {
      className,
      key: 'font-style',
      type: 'select-inline',
      props: {
        label: TRANSLATE?.FontStyle ?? 'Font Style',
        placeholder: 'font-style',
        options: [
          { value: null, label: TRANSLATE?.None ?? 'None' },
          { value: 'italic', label: TRANSLATE?.FontStyle_Italic ?? 'Italic' },
          { value: 'oblique', label: TRANSLATE?.FontStyle_Oblique ?? 'Oblique' },
          { value: 'normal', label: TRANSLATE?.FontStyle_Normal ?? 'Normal' }
        ]
      }
    },
    {
      className,
      key: 'font-weight',
      type: 'select-inline',
      props: {
        label: TRANSLATE?.FontWeight ?? 'Font Weight',
        placeholder: 'font-weight',
        options: [
          { value: null, label: TRANSLATE?.None ?? 'None' },
          { value: 'bold', label: TRANSLATE?.FontWeight_Bold ?? 'Bold' },
          { value: 'lighter', label: TRANSLATE?.FontWeight_Lighter ?? 'Lighter' },
          { value: 'normal', label: TRANSLATE?.FontWeight_Normal ?? 'Normal' }
        ]
      }
    },
    {
      className,
      key: 'text-decoration',
      type: 'select-inline',
      props: {
        label: TRANSLATE?.TextDecoration ?? 'Text Decoration',
        placeholder: 'text-decoration',
        options: [
          { value: null, label: TRANSLATE?.None ?? 'None' },
          { value: 'overline', label: TRANSLATE?.TextDecoration_Overline ?? 'Overline' },
          { value: 'underline', label: TRANSLATE?.TextDecoration_Underline ?? 'Underline' },
          { value: 'line-through', label: TRANSLATE?.TextDecoration_LineThrough ?? 'Line Through' }
        ]
      }
    },
    {
      className,
      key: 'text-align',
      type: 'select-inline',
      props: {
        label: TRANSLATE?.TextAlign ?? 'Text Align',
        placeholder: 'text-align',
        options: [
          { value: null, label: TRANSLATE?.None ?? 'None' },
          { value: 'left', label: TRANSLATE?.TextAlign_Left ?? 'Left' },
          { value: 'center', label: TRANSLATE?.TextAlign_Center ?? 'Center' },
          { value: 'right', label: TRANSLATE?.TextAlign_Right ?? 'Right' },
          { value: 'top', label: TRANSLATE?.TextAlign_Top ?? 'Top' },
          { value: 'middle', label: TRANSLATE?.TextAlign_Middle ?? 'Middle' },
          { value: 'bottom', label: TRANSLATE?.TextAlign_Bottom ?? 'Bottom' }
        ]
      }
    }
  ]
}

export function Width(CSS, className) {
  return {
    className,
    key: 'width',
    type: 'slider',
    props: {
      label: CSS?.Width ?? 'Width',
      placeholder: 'width',
      thumbLabel: true,
      autoScale: true,
      unit: 'px'
    }
  }
}

export function Height(CSS, className: string) {
  return {
    className,
    key: 'height',
    type: 'slider',
    props: {
      label: CSS?.Height ?? 'Height',
      placeholder: 'height',
      thumbLabel: true,
      autoScale: true,
      unit: 'px'
    }
  }
}

export function MinWidth(CSS, className) {
  return {
    className,
    key: 'min-width',
    type: 'slider',
    props: {
      label: CSS?.MinWidth ?? 'Min Width',
      placeholder: 'min-width',
      thumbLabel: true,
      autoScale: true,
      unit: 'px'
    }
  }
}

export function MinHeight(CSS, className) {
  return {
    className,
    key: 'min-height',
    type: 'slider',
    props: {
      label: CSS?.MinHeight ?? 'Min Height',
      placeholder: 'min-height',
      thumbLabel: true,
      autoScale: true,
      unit: 'px'
    }
  }
}

export function MaxWidth(CSS, className) {
  return {
    className,
    key: 'max-width',
    type: 'slider',
    props: {
      label: CSS?.MaxWidth ?? 'Max Width',
      placeholder: 'max-width',
      thumbLabel: true,
      autoScale: true,
      unit: 'px'
    }
  }
}

export function MaxHeight(CSS, className) {
  return {
    className,
    key: 'max-height',
    type: 'slider',
    props: {
      label: CSS?.MaxHeight ?? 'Max Height',
      placeholder: 'max-height',
      thumbLabel: true,
      autoScale: true,
      unit: 'px'
    }
  }
}

export function displayDensity(COMMON) {
  return {
    className: FORMLY_W_FULL,
    key: 'displayDensity',
    type: 'button-toggle',
    props: {
      label: COMMON?.Display_Density ?? 'Display Density',
      options: [
        {
          value: DisplayDensity.comfortable,
          label: COMMON?.DensityComfortable ?? 'Comfortable',
          icon: 'density_large'
        },
        {
          value: DisplayDensity.cosy,
          label: COMMON?.DensityCosy ?? 'Cosy',
          icon: 'density_medium'
        },
        {
          value: DisplayDensity.compact,
          label: COMMON?.DensityCompact ?? 'Compact',
          icon: 'density_small'
        }
      ]
    }
  }
}

export function Appearance(className: string, COMMON) {
  return {
    key: 'appearance',
    wrappers: ['accordion'],
    props: {
      label: COMMON?.Appearance ?? 'Appearance',
      expanded: true
    },
    fieldGroupClassName: FORMLY_ROW,
    fieldGroup: Appearances(className, COMMON)
  }
}

export function Appearances(className: string, COMMON) {
  return [
    displayDensity(COMMON)
    // {
    //   className,
    //   key: 'appearance',
    //   type: 'button-toggle',
    //   props: {
    //     label: COMMON?.FormFieldAppearance ?? 'Form Field Appearance',
    //     options: [
    //       { value: 'standard', label: COMMON?.FormFieldAppearance_Standard ?? 'Standard' },
    //       { value: 'fill', label: COMMON?.FormFieldAppearance_Fill ?? 'Fill' },
    //       { value: 'outline', label: COMMON?.FormFieldAppearance_Outline ?? 'Outline' }
    //     ]
    //   }
    // },
    // {
    //   className,
    //   key: 'floatLabel',
    //   type: 'button-toggle',
    //   props: {
    //     label: COMMON?.FormFieldFloatLabel ?? 'Form Field Float Label',
    //     options: [
    //       { value: 'always', label: COMMON?.FormFieldFloatLabel_Always ?? 'Always' },
    //       { value: 'never', label: COMMON?.FormFieldFloatLabel_Never ?? 'Never' },
    //       { value: 'auto', label: COMMON?.FormFieldFloatLabel_Auto ?? 'Auto' }
    //     ]
    //   }
    // }
  ]
}

export function BoxShadow(className?: string, TRANSLATE?) {
  return {
    className,
    key: 'box-shadow',
    type: 'input-inline',
    props: {
      label: TRANSLATE?.BoxShadow ?? 'Box Shadow',
      placeholder: 'box-shadow'
    }
  }
}

export function Borders(className?: string, TRANSLATE?) {
  return [
    {
      className: FORMLY_W_FULL,
      key: 'border-width',
      type: 'slider',
      props: {
        label: TRANSLATE?.BorderWidth ?? 'Border Width',
        placeholder: 'border-width',
        thumbLabel: true,
        autoScale: true,
        unit: 'px'
      }
    },
    {
      className: FORMLY_W_FULL,
      key: 'border-radius',
      type: 'slider',
      props: {
        label: TRANSLATE?.BorderRadius ?? 'Border Radius',
        placeholder: 'border-radius',
        thumbLabel: true,
        autoScale: true,
        unit: 'px'
      }
    },
    {
      className,
      key: 'border-color',
      type: 'input-inline',
      props: {
        label: TRANSLATE?.BorderColor ?? 'Border Color',
        placeholder: 'border-color'
      }
    },
    {
      className,
      key: 'border-style',
      type: 'select-inline',
      props: {
        label: TRANSLATE?.BorderStyle ?? 'Border Style',
        placeholder: 'border-style',
        options: [
          { value: null, label: TRANSLATE?.BorderStyle_Null ?? 'Null' },
          { value: 'none', label: TRANSLATE?.BorderStyle_None ?? 'None' },
          { value: 'hidden', label: TRANSLATE?.BorderStyle_Hidden ?? 'Hidden' },
          { value: 'solid', label: TRANSLATE?.BorderStyle_Solid ?? 'Solid' },
          { value: 'dashed', label: TRANSLATE?.BorderStyle_Dashed ?? 'Dashed' },
          { value: 'dotted', label: TRANSLATE?.BorderStyle_Dotted ?? 'Dotted' },
          { value: 'double', label: TRANSLATE?.BorderStyle_Double ?? 'Double' },
          { value: 'groove', label: TRANSLATE?.BorderStyle_Groove ?? 'Groove' },
          { value: 'ridge', label: TRANSLATE?.BorderStyle_Ridge ?? 'Ridge' },
          { value: 'inset', label: TRANSLATE?.BorderStyle_Inset ?? 'Inset' },
          { value: 'outset', label: TRANSLATE?.BorderStyle_Outset ?? 'Outset' }
        ]
      }
    }
  ]
}

export function Size(className?: string, CSS?) {
  return [
    Width(CSS, className),
    MinWidth(CSS, className),
    MaxWidth(CSS, className),
    Height(CSS, className),
    MinHeight(CSS, className),
    MaxHeight(CSS, className)
  ]
}

export function ColorOptions(I18N) {
  return [
    { value: null, label: I18N?.Common?.Color_Auto ?? 'Auto' },
    { value: 'primary', label: I18N?.Common?.Color_Primary ?? 'Primary' },
    { value: 'accent', label: I18N?.Common?.Color_Accent ?? 'Accent' },
    { value: 'warn', label: I18N?.Common?.Color_Warn ?? 'Warn' }
  ]
}
