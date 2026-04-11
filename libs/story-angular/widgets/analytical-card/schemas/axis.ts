import { AccordionWrappers, FORMLY_ROW } from '@xpert-ai/story/designer'
import {
  Aligns,
  AreaStyles,
  Borders,
  FontStyles,
  LineTypeOptions,
  Opacity,
  Orient,
  Positions,
  Shadows,
  SingleColor,
  Symbols,
  TextBorderShadow,
  TextOverflow,
  WidthHeight
} from './common'

export function CategoryAxisCapacity(className: string, I18N?) {
  return AccordionWrappers([
    {
      key: 'categoryAxis',
      label: I18N?.CATEGORY_AXIS?.TITLE ?? 'Category Axis',
      fieldGroup: CategoryAxis(className, I18N)
    }
  ])
}

export function ValueAxisCapacity(className: string, I18N?) {
  const keyShow = '__showValueAxis__'
  return [
    {
      key: keyShow,
      type: 'empty'
    },
    {
      wrappers: ['accordion'],
      props: {
        elevationZ: true
      },
      fieldGroup: [
        {
          key: 'valueAxis',
          hideExpression: `!field.parent.model || !field.parent.model.` + keyShow,
          props: {
            label: I18N?.VALUE_AXIS?.TITLE ?? 'Value Axis',
            keyShow
          },
          fieldGroup: ValueAxis(className, I18N)
        }
      ]
    }
  ]
}

export function AxisCapacity(className: string, I18N?) {
  const keyShow = '__showAxis__'
  return [
    {
      key: keyShow,
      type: 'empty'
    },
    {
      wrappers: ['accordion'],
      props: {
        elevationZ: true
      },
      fieldGroup: [
        {
          key: 'axis',
          hideExpression: `!field.parent.model || !field.parent.model.` + keyShow,
          props: {
            label: I18N?.Axis?.Title ?? 'Axis',
            keyShow
          },
          fieldGroup: ValueAxis(className, I18N)
        }
      ]
    }
  ]
}

export function CategoryAxis(className: string, I18N?) {
  return [
    {
      fieldGroupClassName: FORMLY_ROW,
      fieldGroup: [
        {
          className,
          key: 'show',
          type: 'checkbox',
          props: {
            label: I18N?.CATEGORY_AXIS?.SHOW ?? 'Show'
          }
        },
        {
          className,
          key: 'position',
          type: 'select',
          props: {
            label: I18N?.CATEGORY_AXIS?.Position ?? 'Position',
            options: [
              { value: null, label: 'None' },
              { value: 'top', label: 'Top' },
              { value: 'bottom', label: 'Bottom' }
            ]
          }
        },
        {
          className,
          key: 'offset',
          type: 'input',
          props: {
            label: I18N?.CATEGORY_AXIS?.Offset ?? 'Offset',
            type: 'number'
          }
        },

        {
          className,
          key: 'showName',
          type: 'toggle',
          props: {
            label: I18N?.CATEGORY_AXIS?.ShowName ?? 'Show Name'
          }
        },

        {
          hideExpression: `!model || !model.showName`,
          className,
          key: 'name',
          type: 'input',
          props: {
            label: I18N?.CATEGORY_AXIS?.Name ?? 'Name'
          }
        },
        {
          hideExpression: `!model || !model.showName`,
          className,
          key: 'nameLocation',
          type: 'select',
          props: {
            label: I18N?.CATEGORY_AXIS?.NameLocation ?? 'Name Location',
            options: [
              { value: null, label: 'None' },
              { value: 'start', label: 'Start' },
              { value: 'center', label: 'Center' },
              { value: 'end', label: 'End' }
            ]
          }
        },
        {
          hideExpression: `!model || !model.showName`,
          className,
          key: 'nameGap',
          type: 'input',
          props: {
            label: I18N?.CATEGORY_AXIS?.NameGap ?? 'Name Gap',
            type: 'number'
          }
        },
        {
          hideExpression: `!model || !model.showName`,
          className,
          key: 'nameRotate',
          type: 'input',
          props: {
            label: I18N?.CATEGORY_AXIS?.NameRotate ?? 'Name Rotate',
            type: 'number'
          }
        },
        {
          className,
          key: 'inverse',
          type: 'checkbox',
          props: {
            label: I18N?.CATEGORY_AXIS?.Inverse ?? 'Inverse'
          }
        },
        {
          className,
          key: 'boundaryGap',
          type: 'checkbox',
          props: {
            label: I18N?.CATEGORY_AXIS?.BoundaryGap ?? 'Boundary Gap'
          }
        },
        {
          className,
          key: 'min',
          type: 'input',
          props: {
            label: I18N?.CATEGORY_AXIS?.Min ?? 'Min'
          }
        },
        {
          className,
          key: 'max',
          type: 'input',
          props: {
            label: I18N?.CATEGORY_AXIS?.Max ?? 'Max'
          }
        },
        {
          className,
          key: 'silent',
          type: 'checkbox',
          props: {
            label: I18N?.CATEGORY_AXIS?.Silent ?? 'Silent'
          }
        }
      ]
    },
    ...SplitLineAccordionWrappers(className, I18N),
    ...AxisLineAccordionWrappers(className, I18N),
    ...AxisTickAccordionWrappers(className, I18N),
    ...AxisLabelAccordionWrappers(className, I18N),
    ...AxisPointerAccordionWrappers(className, I18N)
  ]
}

export function AxisLineAccordionWrappers(className: string, I18N) {
  return AccordionWrappers([
    {
      key: 'axisLine',
      label: I18N?.AxisLine?.Title ?? 'Axis Line',
      fieldGroup: [
        {
          key: 'show',
          type: 'checkbox',
          props: {
            label: I18N?.Common?.Show ?? 'Show'
          }
        },
        {
          fieldGroupClassName: FORMLY_ROW,
          fieldGroup: [
            {
              className,
              key: 'onZero',
              type: 'checkbox',
              props: {
                label: I18N?.AxisLine?.OnZero ?? 'On Zero'
              }
            },
            ...Symbols(className, I18N)
          ]
        },
        {
          key: 'lineStyle',
          wrappers: ['panel'],
          fieldGroupClassName: FORMLY_ROW,
          props: {
            label: I18N?.LineStyle?.Title ?? 'Line Style'
          },
          fieldGroup: LineStyle(className, I18N)
        }
      ]
    }
  ])
}

export function LineStyleExpansion(className: string, I18N, keyShow: string) {
  return {
    key: 'lineStyle',
    hideExpression: `!field.parent.model || !field.parent.model.` + keyShow,
    props: {
      label: I18N?.LineStyle?.Title ?? 'Line Style',
      toggleable: true,
      keyShow: keyShow
    },
    fieldGroupClassName: FORMLY_ROW,
    fieldGroup: LineStyle(className, I18N)
  }
}

export function LineStyle(className: string, I18N) {
  return [
    SingleColor(className, I18N),
    {
      className,
      key: 'width',
      type: 'input',
      props: {
        label: I18N?.LineStyle?.Width ?? 'Width',
        type: 'number'
      }
    },
    {
      className,
      key: 'type',
      type: 'select',
      props: {
        label: I18N?.LineStyle?.Type ?? 'Type',
        options: LineTypeOptions(I18N)
      }
    },
    Opacity(className, I18N),
    ...Shadows(className, I18N)
  ]
}

export function ValueAxis(className: string, I18N?) {
  return [
    {
      fieldGroupClassName: FORMLY_ROW,
      fieldGroup: [
        {
          className,
          key: 'show',
          type: 'checkbox',
          props: {
            label: I18N?.VALUE_AXIS?.SHOW ?? 'Show'
          }
        },
        {
          className,
          key: 'showName',
          type: 'toggle',
          props: {
            label: I18N?.CATEGORY_AXIS?.ShowName ?? 'Show Name'
          }
        },

        {
          hideExpression: `!model || !model.showName`,
          className,
          key: 'name',
          type: 'input',
          props: {
            label: I18N?.CATEGORY_AXIS?.Name ?? 'Name'
          }
        },
        {
          hideExpression: `!model || !model.showName`,
          className,
          key: 'nameLocation',
          type: 'select',
          props: {
            label: I18N?.CATEGORY_AXIS?.NameLocation ?? 'Name Location',
            options: [
              { value: null, label: 'None' },
              { value: 'start', label: 'Start' },
              { value: 'center', label: 'Center' },
              { value: 'end', label: 'End' }
            ]
          }
        },
        {
          hideExpression: `!model || !model.showName`,
          className,
          key: 'nameGap',
          type: 'input',
          props: {
            label: I18N?.CATEGORY_AXIS?.NameGap ?? 'Name Gap',
            type: 'number'
          }
        },
        {
          hideExpression: `!model || !model.showName`,
          className,
          key: 'nameRotate',
          type: 'input',
          props: {
            label: I18N?.CATEGORY_AXIS?.NameRotate ?? 'Name Rotate',
            type: 'number'
          }
        },
        {
          className,
          key: 'splitNumber',
          type: 'slider',
          props: {
            label: I18N?.VALUE_AXIS?.SplitNumber ?? 'Split Number',
            type: 'number',
            placeholder: 'splitNumber',
            thumbLabel: true,
            autoScale: true,
            min: 0,
            max: 10
          }
        },
        {
          className,
          key: 'scale',
          type: 'checkbox',
          props: {
            label: I18N?.VALUE_AXIS?.ValueScale ?? 'Value Scale',
            placeholder: 'scale'
          }
        },
        {
          hideExpression: `!!model && model.scale`,
          className,
          key: 'min',
          type: 'slider',
          props: {
            label: I18N?.VALUE_AXIS?.Min ?? 'Min',
            type: 'number',
            placeholder: 'min',
            thumbLabel: true,
            autoScale: true
          }
        },
        {
          hideExpression: `!!model && model.scale`,
          className,
          key: 'max',
          type: 'slider',
          props: {
            label: I18N?.VALUE_AXIS?.Max ?? 'Max',
            type: 'number',
            placeholder: 'max',
            thumbLabel: true,
            autoScale: true
          }
        },
        {
          className,
          key: 'position',
          type: 'select',
          props: {
            label: I18N?.CATEGORY_AXIS?.Position ?? 'Position',
            options: [
              { value: null, label: I18N?.Common?.None ?? 'None' },
              { value: 'left', label: I18N?.Common?.Left ?? 'Left' },
              { value: 'right', label: I18N?.Common?.Right ?? 'Right' },
              { value: 'top', label: I18N?.Common?.Top ?? 'Top' },
              { value: 'bottom', label: I18N?.Common?.Bottom ?? 'Bottom' }
            ]
          }
        }
      ]
    },

    ...SplitLineAccordionWrappers(className, I18N),
    ...AxisLineAccordionWrappers(className, I18N),
    ...AxisTickAccordionWrappers(className, I18N),
    ...AxisMinorTickAccordionWrappers(className, I18N),
    ...AxisLabelAccordionWrappers(className, I18N),
    ...AxisPointerAccordionWrappers(className, I18N)
  ]
}

export function AxisLabelAccordionWrappers(className: string, I18N) {
  return AccordionWrappers([
    {
      key: 'axisLabel',
      label: I18N?.AxisLabel?.Title ?? 'Axis Label',
      fieldGroup: [
        {
          key: 'show',
          type: 'checkbox',
          props: {
            label: I18N?.Common?.Show ?? 'Show'
          }
        },
        {
          fieldGroupClassName: FORMLY_ROW,
          fieldGroup: [
            {
              className,
              key: 'interval',
              type: 'input',
              props: {
                label: I18N?.AxisLabel?.Interval ?? 'Interval',
                placeholder: 'interval'
              }
            },

            {
              className,
              key: 'inside',
              type: 'checkbox',
              props: {
                label: I18N?.AxisLabel?.Inside ?? 'Inside'
              }
            },

            {
              className,
              key: 'rotate',
              type: 'input',
              props: {
                label: I18N?.AxisLabel?.Rotate ?? 'Rotate',
                type: 'number',
                placeholder: '-90 ~ 90'
              }
            },
            {
              className,
              key: 'showMinLabel',
              type: 'checkbox',
              props: {
                label: I18N?.AxisLabel?.ShowMinLabel ?? 'Show Min Label'
              }
            },
            {
              className,
              key: 'showMaxLabel',
              type: 'checkbox',
              props: {
                label: I18N?.AxisLabel?.ShowMaxLabel ?? 'Show Max Label'
              }
            },

            {
              className,
              key: 'hideOverlap',
              type: 'checkbox',
              props: {
                label: I18N?.AxisLabel?.HideOverlap ?? 'Hide Overlap'
              }
            },
            ...FontStyles(className, I18N),
            ...Aligns(className, I18N),
            ...Borders(className, I18N),
            ...Shadows(className, I18N),
            ...WidthHeight(className, I18N),
            // Font Styles
            ...TextBorderShadow(className, I18N),
            ...TextOverflow(className, I18N)
          ]
        }
      ]
    }
  ])
}

export function SplitLineAccordionWrappers(className: string, I18N) {
  return AccordionWrappers([
    {
      key: 'splitLine',
      label: I18N?.SplitLine?.Title ?? 'Split Line',
      fieldGroup: [
        {
          fieldGroupClassName: FORMLY_ROW,
          fieldGroup: [
            {
              className,
              key: 'show',
              type: 'checkbox',
              props: {
                label: I18N?.SplitLine?.Show ?? 'Show'
              }
            },
            {
              className,
              key: 'interval',
              type: 'input',
              props: {
                label: I18N?.SplitLine?.Interval ?? 'Interval',
                placeholder: '0,1,2...auto'
              }
            }
          ]
        },
        {
          key: 'lineStyle',
          wrappers: ['panel'],
          fieldGroupClassName: FORMLY_ROW,
          props: {
            label: I18N?.SplitLine?.LineStyle ?? 'Line Style'
          },
          fieldGroup: LineStyle(className, I18N)
        }
      ]
    },

    {
      key: 'splitArea',
      label: I18N?.SplitArea?.Title ?? 'Split Area',
      fieldGroup: [
        {
          fieldGroupClassName: FORMLY_ROW,
          fieldGroup: [
            {
              className,
              key: 'show',
              type: 'checkbox',
              props: {
                label: I18N?.SplitArea?.Show ?? 'Show'
              }
            },
            {
              className,
              key: 'interval',
              type: 'input',
              props: {
                label: I18N?.SplitArea?.Interval ?? 'Interval',
                placeholder: '0,1,2...auto'
              }
            }
          ]
        },
        {
          key: 'areaStyle',
          wrappers: ['panel'],
          fieldGroupClassName: FORMLY_ROW,
          props: {
            label: I18N?.SplitArea?.AreaStyle ?? 'Area Style'
          },
          fieldGroup: AreaStyles(className, I18N)
        }
      ]
    }
  ])
}

export function SingleAxisAccordionWrappers(className: string, I18N) {
  return AccordionWrappers([
    {
      key: 'singleAxis',
      label: I18N?.SingleAxis?.Title ?? 'Single Axis',
      fieldGroup: [
        {
          fieldGroupClassName: FORMLY_ROW,
          fieldGroup: [
            ...AxisNames(className, I18N),
            Orient(className, I18N),
            ...Positions(className, I18N),
            ...WidthHeight(className, I18N)
          ]
        },
        ...AxisLineAccordionWrappers(className, I18N),
        ...AxisLabelAccordionWrappers(className, I18N),
        ...AxisTickAccordionWrappers(className, I18N),
        ...SplitLineAccordionWrappers(className, I18N),
        ...AxisMinorTickAccordionWrappers(className, I18N),
        ...AxisMinorSplitLineAccordionWrappers(className, I18N),
        ...AxisPointerAccordionWrappers(className, I18N)
      ]
    }
  ])
}

export function AxisNames(className: string, I18N) {
  return [
    {
      className,
      key: 'name',
      type: 'input',
      props: {
        label: I18N?.Axis?.Name ?? 'Name'
      }
    },
    {
      className,
      key: 'nameLocation',
      type: 'select',
      props: {
        label: I18N?.Axis?.NameLocation ?? 'Name Location',
        options: [
          { value: null, label: 'None' },
          { value: 'start', label: 'Start' },
          { value: 'center', label: 'Center' },
          { value: 'end', label: 'End' }
        ]
      }
    },
    {
      className,
      key: 'nameGap',
      type: 'input',
      props: {
        label: I18N?.Axis?.NameGap ?? 'Name Gap',
        type: 'number'
      }
    },
    {
      className,
      key: 'nameRotate',
      type: 'input',
      props: {
        label: I18N?.Axis?.NameRotate ?? 'Name Rotate',
        type: 'number'
      }
    }
  ]
}

export function AxisTickAccordionWrappers(className: string, I18N) {
  const AxisTick = I18N?.Axis?.AxisTick
  return AccordionWrappers([
    {
      key: 'axisTick',
      label: AxisTick?.Title ?? 'Axis Tick',
      fieldGroup: [
        {
          key: 'show',
          type: 'checkbox',
          props: {
            label: AxisTick?.Show ?? 'Show'
          }
        },
        {
          fieldGroupClassName: FORMLY_ROW,
          fieldGroup: [
            {
              className,
              key: 'alignWithLabel',
              type: 'checkbox',
              props: {
                label: AxisTick?.AlignWithLabel ?? 'Align with label'
              }
            },

            {
              className,
              key: 'interval',
              type: 'input',
              props: {
                label: AxisTick?.Interval ?? 'Interval'
              }
            },

            {
              className,
              key: 'inside',
              type: 'checkbox',
              props: {
                label: AxisTick?.Inside ?? 'Inside'
              }
            },

            {
              className,
              key: 'length',
              type: 'input',
              props: {
                label: AxisTick?.Length ?? 'Length',
                type: 'number'
              }
            }
          ]
        },
        {
          key: 'lineStyle',
          wrappers: ['panel'],
          props: {
            label: I18N?.LineStyle?.Title ?? 'Line Style'
          },
          fieldGroupClassName: FORMLY_ROW,
          fieldGroup: LineStyle(className, I18N)
        }
      ]
    }
  ])
}

export function AxisMinorTickAccordionWrappers(className: string, I18N) {
  const MinorTick = I18N?.Axis?.MinorTick
  return AccordionWrappers([
    {
      key: 'minorTick',
      label: MinorTick?.Title ?? 'Minor Tick',
      fieldGroup: [
        {
          key: 'show',
          type: 'checkbox',
          props: {
            label: MinorTick?.Show ?? 'Show'
          }
        },
        {
          fieldGroupClassName: FORMLY_ROW,
          fieldGroup: [
            {
              className,
              key: 'interval',
              type: 'input',
              props: {
                label: MinorTick?.SplitNumber ?? 'Split Number'
              }
            },

            {
              className,
              key: 'length',
              type: 'input',
              props: {
                label: MinorTick?.Length ?? 'Length',
                type: 'number'
              }
            }
          ]
        },
        {
          key: 'lineStyle',
          wrappers: ['panel'],
          props: {
            label: I18N?.LineStyle?.Title ?? 'Line Style'
          },
          fieldGroupClassName: FORMLY_ROW,
          fieldGroup: LineStyle(className, I18N)
        }
      ]
    }
  ])
}

export function AxisMinorSplitLineAccordionWrappers(className: string, I18N) {
  return AccordionWrappers([
    {
      key: 'minorSplitLine',
      label: I18N?.Axis?.MinorSplitLine ?? 'Minor Split Line',
      fieldGroup: [
        {
          key: 'show',
          type: 'checkbox',
          props: {
            label: I18N?.SplitLine?.Show ?? 'Show'
          }
        },
        {
          key: 'lineStyle',
          wrappers: ['panel'],
          fieldGroupClassName: FORMLY_ROW,
          props: {
            label: I18N?.SplitLine?.LineStyle ?? 'Line Style'
          },
          fieldGroup: LineStyle(className, I18N)
        }
      ]
    }
  ])
}

export function AxisPointerAccordionWrappers(className: string, I18N) {
  return AccordionWrappers([
    {
      key: 'axisPointer',
      label: I18N?.AxisPointer?.Title ?? 'Axis Pointer',
      fieldGroup: [
        {
          key: 'show',
          type: 'checkbox',
          props: {
            label: I18N?.AxisPointer?.Show ?? 'Show'
          }
        },
        {
          fieldGroupClassName: FORMLY_ROW,
          fieldGroup: [
            {
              className,
              key: 'type',
              type: 'select',
              props: {
                label: I18N?.AxisPointer?.Type ?? 'Type',
                options: [
                  { value: 'line', label: 'Line' },
                  { value: 'shadow', label: 'Shadow' },
                  { value: 'none', label: 'None' }
                ]
              }
            },
            {
              className,
              key: 'snap',
              type: 'checkbox',
              props: {
                label: I18N?.AxisPointer?.Snap ?? 'Snap'
              }
            }
          ]
        },
        AxisPointerHandle(className, I18N)
      ]
    }
  ])
}

export function AxisPointerHandle(className: string, I18N) {
  return {
    key: 'handle',
    wrappers: ['panel'],
    props: {
      label: I18N?.AxisPointer?.Handle?.Title ?? 'Handle'
    },
    fieldGroup: [
      {
        key: 'show',
        type: 'checkbox',
        props: {
          label: I18N?.AxisPointer?.Handle?.Show ?? 'Show'
        }
      },
      {
        fieldGroupClassName: FORMLY_ROW,
        fieldGroup: [
          {
            className,
            key: 'type',
            type: 'select',
            props: {
              label: I18N?.AxisPointer?.Handle?.Type ?? 'Type',
              options: [
                { value: 'line', label: 'Line' },
                { value: 'shadow', label: 'Shadow' },
                { value: 'none', label: 'None' }
              ]
            }
          }
        ]
      }
    ]
  }
}
