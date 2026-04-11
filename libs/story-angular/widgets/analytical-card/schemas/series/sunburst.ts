import { FORMLY_ROW } from '@xpert-ai/story/designer'
import { ItemStyle, ItemStyleAccordionWrappers } from '../common'
import { Labels } from './label'
import { CenterRadius } from './pie'

export function SunburstCapacity(className: string, I18N) {
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
            label: I18N?.SeriesStyle?.Title ?? 'Series Attributes',
            keyShow
          },
          fieldGroup: [
            {
              fieldGroupClassName: FORMLY_ROW,
              fieldGroup: [
                {
                  className,
                  key: 'hasAll',
                  type: 'checkbox',
                  props: {
                    label: I18N?.SeriesStyle?.HasAll ?? 'Has All'
                  }
                },

                {
                  className,
                  key: 'nodeClick',
                  type: 'select',
                  props: {
                    label: I18N?.Sunburst?.NodeClick ?? 'Node Click',
                    options: [
                      { value: null, label: 'None' },
                      { value: 'rootToNode', label: 'rootToNode' },
                      { value: 'link', label: 'link' }
                    ]
                  }
                },

                ...CenterRadius(className, I18N),

                {
                  className: 'ngm-formly__col ngm-formly__col-12',
                  key: 'levels',
                  type: 'json',
                  props: {
                    label: I18N?.Sunburst?.LevelsOptions || 'Levels Options',
                    autosize: true
                  }
                }
              ]
            },
            
            {
              key: '__showLabel__',
              type: 'empty'
            },
            {
              key: '__showEmphasis__',
              type: 'empty'
            },
            {
              wrappers: ['accordion'],
              props: {
                elevationZ: true
              },
              fieldGroup: [
                SunburstLabel(className, I18N, '__showLabel__'),
                EmphasisExpansion(className, I18N, '__showEmphasis__')
              ]
            },
            ...ItemStyleAccordionWrappers(className, I18N),
          ]
        }
      ]
    }
  ]
}

function SunburstLabel(className: string, I18N, keyShow: string) {
  return {
    key: 'label',
    hideExpression: `!field.parent.model || !field.parent.model.` + keyShow,
    props: {
      label: I18N?.Sunburst?.Label ?? 'Label',
      toggleable: true,
      keyShow
    },
    fieldGroup: [
      {
        fieldGroupClassName: FORMLY_ROW,
        fieldGroup: [
          {
            className,
            key: 'rotate',
            type: 'select',
            props: {
              label: I18N?.Sunburst?.Rotate ?? 'Rotate',
              options: [
                { value: null, label: 'None' },
                { value: 'radial', label: 'radial' },
                { value: 'tangential', label: 'tangential' }
              ]
            }
          },
    
          {
            className,
            key: 'minAngle',
            type: 'input',
            props: {
              label: I18N?.Sunburst?.MinAngle || 'Min Angle',
              type: 'number'
            }
          },
          ...Labels(className, I18N)
          ]
      }
      
    ]
  }
}

export function EmphasisExpansion(className: string, I18N, keyShow: string) {
  return {
    key: 'emphasis',
    hideExpression: `!field.parent && !field.parent.model.` + keyShow,
    props: {
      label: I18N?.EMPHASIS?.TITLE ?? 'Emphasis',
      toggleable: true,
      keyShow: keyShow
    },
    fieldGroupClassName: FORMLY_ROW,
    fieldGroup: [
      {
        className,
        key: 'disabled',
        type: 'checkbox',
        props: {
          label: I18N?.EMPHASIS?.DISABLED ?? 'Disabled'
        }
      },
      {
        className,
        key: 'scale',
        type: 'checkbox',
        props: {
          label: I18N?.EMPHASIS?.Scale ?? 'Scale'
        }
      },
      {
        className,
        key: 'focus',
        type: 'select',
        props: {
          label: I18N?.EMPHASIS?.FOCUS ?? 'Focus',
          options: [
            { value: null, label: I18N?.EMPHASIS?.Focus_None ?? 'None' },
            { value: 'self', label: I18N?.EMPHASIS?.Focus_Self ?? 'Self' },
            { value: 'series', label: I18N?.EMPHASIS?.Focus_Series ?? 'Series' },
            { value: 'ancestor', label: I18N?.EMPHASIS?.Focus_Ancestor ?? 'Ancestor' },
            { value: 'descendant', label: I18N?.EMPHASIS?.Focus_Descendant ?? 'Descendant' }
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
            { value: null, label: I18N?.EMPHASIS?.BlurScope_None ?? 'None' },
            { value: 'self', label: I18N?.EMPHASIS?.BlurScope_CoordinateSystem ?? 'Coordinate System' },
            { value: 'series', label: I18N?.EMPHASIS?.BlurScope_Series ?? 'Series' },
            { value: 'series', label: I18N?.EMPHASIS?.BlurScope_Global ?? 'Global' }
          ]
        }
      },
      {
        key: 'label',
        props: {
          label: I18N?.SERIE_STYLE.TEXT_LABEL
        },
        fieldGroup: [
          {
            key: 'textLabel',
            type: 'checkbox',
            props: {
              label: I18N?.SERIE_STYLE.IS_LABEL
            }
          }
        ]
      },
      ItemStyle(className, I18N)
    ]
  }
}
