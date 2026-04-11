import { Positions, UniversalTransition } from '../common'
import { FORMLY_ROW } from '@xpert-ai/story/designer'

export function TreeCapacity(className, I18N?) {
  const keyShow = '__showSeriesAttributes__'
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
          key: 'seriesStyle',
          hideExpression: `!field.parent.model || !field.parent.model.${keyShow}`,
          props: {
            label: I18N?.Tree?.SeriesStyle?.Title ?? 'Series Style',
            keyShow
          },
          fieldGroup: [
            {
              fieldGroupClassName: FORMLY_ROW,
              fieldGroup: [
                UniversalTransition(className, I18N),
                ...Positions(className, I18N),
                // 使用图形的 orient 进行控制
                // {
                //   className,
                //   key: 'layout',
                //   type: 'select',
                //   props: {
                //     label: I18N?.Tree?.SeriesStyle?.Layout ?? 'Layout',
                //     options: [
                //       { value: 'orthogonal', label: I18N?.Tree?.SeriesStyle?.Orthogonal ?? 'Orthogonal' },
                //       { value: 'radial', label: I18N?.Tree?.SeriesStyle?.Radial ?? 'Radial' }
                //     ]
                //   }
                // },
                {
                  hideExpression: `!model || model.layout === 'radial'`,
                  className,
                  key: 'orient',
                  type: 'select',
                  props: {
                    label: I18N?.Tree?.SeriesStyle?.Orient ?? 'Orient',
                    options: [
                      { value: 'LR', label: 'LR' },
                      { value: 'RL', label: 'RL' },
                      { value: 'TB', label: 'TB' },
                      { value: 'BT', label: 'BT' }
                    ]
                  }
                },
                {
                  hideExpression: `!model || model.layout === 'radial'`,
                  className,
                  key: 'edgeShape',
                  type: 'select',
                  props: {
                    label: I18N?.Tree?.SeriesStyle?.EdgeShape ?? 'Edge Shape',
                    options: [
                      { value: 'curve', label: 'Curve' },
                      { value: 'polyline', label: 'Polyline' }
                    ]
                  }
                },
                {
                  className,
                  key: 'edgeForkPosition',
                  type: 'input',
                  props: {
                    label: I18N?.Tree?.SeriesStyle?.EdgeForkPosition ?? 'Edge Fork Position'
                  }
                },

                {
                  className,
                  key: 'symbolSize',
                  type: 'input',
                  props: {
                    label: I18N?.Common?.SymbolSize ?? 'Symbol Size',
                    type: 'number'
                  }
                },
                {
                  className,
                  key: 'initialTreeDepth',
                  type: 'input',
                  defaultValue: 2,
                  props: {
                    label: I18N?.Tree?.SeriesStyle?.InitialTreeDepth ?? 'Initial Tree Depth',
                    type: 'number'
                  }
                }
              ]
            },

            TreeLabel(className, I18N),

            {
              key: '__showLeaves__',
              type: 'empty'
            },
            {
              wrappers: ['accordion'],
              props: {
                elevationZ: true
              },
              fieldGroup: [LeavesExpansion(className, I18N, '__showLeaves__')]
            }
          ]
        }
      ]
    }
  ]
}

export function LeavesExpansion(className: string, I18N: any, keyShow: string) {
  return {
    key: 'leaves',
    hideExpression: `!field.parent && !field.parent.model.` + keyShow,
    props: {
      label: I18N?.Tree?.SeriesStyle?.Leaves ?? 'Leaves',
      toggleable: true,
      keyShow
    },
    fieldGroup: [TreeLabel(className, I18N)]
  }
}

export function TreeLabel(className, I18N?) {
  return {
    key: 'label',
    wrappers: ['panel'],
    props: {
      label: I18N?.Common?.Label ?? 'Label'
    },
    fieldGroupClassName: FORMLY_ROW,
    fieldGroup: [
      {
        className,
        key: 'position',
        type: 'select',
        props: {
          label: I18N?.Common?.Position ?? 'Position',
          options: [
            {
              value: 'left',
              label: I18N?.Common?.Left ?? 'Left'
            },
            {
              value: 'right',
              label: I18N?.Common?.Right ?? 'Right'
            }
          ]
        }
      }
    ]
  }
}

export function Emphasis(className: string, I18N) {
  return {
    key: 'emphasis',
    wrappers: ['accordion'],
    props: {
      label: I18N?.EMPHASIS?.TITLE ?? 'Emphasis',
      toggleable: true
    },
    fieldGroupClassName: FORMLY_ROW,
    fieldGroup: [
      {
        className,
        key: 'focus',
        type: 'select',
        props: {
          label: I18N?.EMPHASIS?.FOCUS ?? 'Focus',
          options: [
            { value: null, label: 'None' },
            { value: 'self', label: 'Self' },
            { value: 'series', label: 'Series' },
            { value: 'ancestor', label: 'Ancestor' },
            { value: 'descendant', label: 'Descendant' }
          ]
        }
      },

      {
        className,
        key: 'blurScope',
        type: 'select',
        props: {
          label: I18N?.EMPHASIS?.BlurScope ?? 'Blur Scope',
          options: [
            { value: null, label: 'None' },
            { value: 'coordinateSystem', label: 'CoordinateSystem' },
            { value: 'series', label: 'Series' },
            { value: 'global', label: 'Global' }
          ]
        }
      }
    ]
  }
}
