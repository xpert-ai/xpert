import { AccordionWrappers, FORMLY_ROW, FORMLY_W_FULL } from '@xpert-ai/story/designer'
import { Orient, Positions, SymbolOptions } from './common'

export function VisualMapCapacity(className: string, I18N?) {
  return AccordionWrappers([{
    key: 'visualMap',
    label: I18N?.VisualMap?.Title ?? 'Visual Map',
    fieldGroup: VisualMap(className, I18N)
  }])
}

export function VisualMap(className: string, I18N?) {
  const isNotPiecewise = `!model || model.type !== 'piecewise'`
  return [
    {
      className: 'ngm-formly__pb-2',
      fieldGroupClassName: FORMLY_ROW,
      fieldGroup: [
        {
          className,
          key: 'type',
          type: 'button-toggle',
          defaultValue: 'continuous',
          props: {
            label: I18N?.VisualMap?.Type ?? 'Type',
            options: [
              {
                value: 'piecewise',
                label: I18N?.VisualMap?.Piecewise ?? 'Piecewise'
              },
              {
                value: 'continuous',
                label: I18N?.VisualMap?.Continuous ?? 'Continuous'
              }
            ]
          }
        },
        {
          className,
          key: 'show',
          type: 'toggle',
          props: {
            label: I18N?.VisualMap?.Show ?? 'Show'
          }
        },

        ...Positions(className, I18N),
        Orient(className, I18N),
        {
          className,
          key: 'inverse',
          type: 'checkbox',
          props: {
            label: I18N?.VisualMap?.Inverse ?? 'Inverse'
          }
        },

        {
          className,
          key: 'realtime',
          type: 'checkbox',
          props: {
            label: I18N?.VisualMap?.Realtime ?? 'Realtime'
          }
        },
        {
          className,
          key: 'calculable',
          type: 'checkbox',
          props: {
            label: I18N?.VisualMap?.Calculable ?? 'Calculable'
          }
        },
        {
          className,
          key: 'min',
          type: 'input',
          props: {
            label: I18N?.VisualMap?.Min ?? 'Min',
            type: 'number'
          }
        },
        {
          className,
          key: 'max',
          type: 'input',
          props: {
            label: I18N?.VisualMap?.Max ?? 'Max',
            type: 'number'
          }
        },
        {
          className,
          key: 'range',
          type: 'json',
          props: {
            label: I18N?.VisualMap?.Range ?? 'Range',
            placeholder: `[number, number]`,
            autosize: true
          }
        },
        {
          className,
          key: 'showLabel',
          type: 'checkbox',
          props: {
            label: I18N?.VisualMap?.ShowLabel ?? 'Show Label'
          }
        },
        {
          className,
          key: 'text',
          type: 'json',
          props: {
            label: I18N?.VisualMap?.Text ?? 'Text',
            placeholder: `["High", "Low"]`,
            autosize: true
          }
        },
        {
          className,
          key: 'precision',
          type: 'input',
          props: {
            label: I18N?.VisualMap?.Precision ?? 'Precision',
            type: 'number'
          }
        },
        {
          className,
          key: 'splitNumber',
          type: 'input',
          props: {
            label: I18N?.VisualMap?.SplitNumber ?? 'Split Number',
            type: 'number'
          },
          expressions: {
            hide: isNotPiecewise,
          },
        },
        {
          className: FORMLY_W_FULL,
          key: 'pieces',
          type: 'json',
          props: {
            label: I18N?.VisualMap?.Pieces ?? 'Pieces',
            autosize: true
          },
          expressions: {
            hide: isNotPiecewise,
          },
        },
        {
          className,
          key: 'itemGap',
          type: 'input',
          props: {
            label: I18N?.VisualMap?.ItemGap ?? 'Item Gap',
            type: 'number'
          },
          expressions: {
            hide: isNotPiecewise,
          },
        },
        {
          className,
          key: 'itemSymbol',
          type: 'select',
          props: {
            label: I18N?.VisualMap?.ItemSymbol ?? 'Item Symbol',
            options: SymbolOptions(I18N)
          },
          expressions: {
            hide: isNotPiecewise,
          },
        },
      ]
    },

    ...AccordionWrappers([
      {
        key: 'inRange',
        label: I18N?.VisualMap?.InRange ?? 'In Range',
        fieldGroup: [
          {
            key: 'color',
            type: 'json',
            props: {
              label: I18N?.Common?.Color ?? 'Color',
              placeholder: I18N?.Common?.ColorJSONPlaceholder ?? 'Color by JSON format',
              autosize: true
            }
          },
          {
            key: 'symbolSize',
            type: 'json',
            props: {
              label: I18N?.VisualMap?.SymbolSize ?? 'SymbolSize',
              placeholder: `[number, number]`,
              autosize: true
            }
          },
          {
            key: 'colorLightness',
            type: 'json',
            props: {
              label: I18N?.VisualMap?.ColorLightness ?? 'Color Lightness',
              placeholder: `[number, number]`,
              autosize: true
            }
          }
        ]
      },
      {
        key: 'outOfRange',
        label: I18N?.VisualMap?.OutofRange ?? 'Out of Range',
        fieldGroup: [
          {
            key: 'color',
            type: 'json',
            props: {
              label: I18N?.Common?.Color ?? 'Color',
              placeholder: I18N?.Common?.ColorJSONPlaceholder ?? 'Color by JSON format',
              autosize: true
            }
          },
          {
            key: 'symbolSize',
            type: 'json',
            props: {
              label: I18N?.VisualMap?.SymbolSize ?? 'SymbolSize',
              placeholder: `[number, number]`,
              autosize: true
            }
          },
          {
            key: 'colorLightness',
            type: 'json',
            props: {
              label: I18N?.VisualMap?.ColorLightness ?? 'Color Lightness',
              placeholder: `[number]`,
              autosize: true
            }
          }
        ]
      },
      {
        key: 'controller',
        label: I18N?.VisualMap?.Controller ?? 'Controller',
        fieldGroup: [
          {
            key: 'inRange',
            wrappers: ['panel'],
            props: {
              label: I18N?.VisualMap?.InRange ?? 'In Range'
            },
            fieldGroup: [
              {
                key: 'color',
                type: 'json',
                props: {
                  label: I18N?.Common?.Color ?? 'Color',
                  placeholder: I18N?.Common?.ColorJSONPlaceholder ?? 'Color by JSON format',
                  autosize: true
                }
              }
            ]
          },
          {
            key: 'outOfRange',
            wrappers: ['panel'],
            props: {
              label: I18N?.VisualMap?.OutofRange ?? 'Out of Range'
            },
            fieldGroup: [
              {
                key: 'color',
                type: 'json',
                props: {
                  label: I18N?.Common?.Color ?? 'Color',
                  placeholder: I18N?.Common?.ColorJSONPlaceholder ?? 'Color by JSON format',
                  autosize: true
                }
              }
            ]
          }
        ]
      }
    ]),
  ]
}
