import { AccordionWrappers, FORMLY_ROW } from '@xpert-ai/story/designer'
import { Opacity, SingleColor, TextStyles } from '../common'

export function Bar3DCapacity(className: string, I18N) {
  return AccordionWrappers([
    {
      key: 'seriesStyle',
      label: I18N?.DDD?.BarSeriesTitle ?? 'Series Attributes',
      fieldGroup: [
        {
          fieldGroupClassName: FORMLY_ROW,
          fieldGroup: [
            {
              className,
              key: 'bevelSize',
              type: 'number',
              props: {
                label: I18N?.DDD?.BevelSize ?? 'Bevel Size',
                placeholder: '0 ~ 1'
              }
            },
            {
              className,
              key: 'bevelSmoothness',
              type: 'number',
              props: {
                label: I18N?.DDD?.BevelSmoothness ?? 'Bevel Smoothness',
                placeholder: '0 ~ 1'
              }
            },
            {
              className,
              key: 'stack',
              type: 'input',
              props: {
                label: I18N?.DDD?.Stack ?? 'Stack'
              }
            },
            // {
            //   className,
            //   key: 'stackStrategy',
            //   type: 'select',
            //   props: {
            //     label: I18N?.DDD?.StackStrategy ?? 'Stack Strategy',
            //     options: [
            //       { value: null, label: 'None' },
            //       { value: 'color', label: 'color' },
            //       { value: 'lambert', label: 'lambert' },
            //       { value: 'realistic', label: 'realistic' }
            //     ]
            //   }
            // },
            {
              className,
              key: 'minHeight',
              type: 'number',
              props: {
                label: I18N?.DDD?.MinHeight ?? 'MinHeight'
              }
            },
            {
              className,
              key: 'silent',
              type: 'checkbox',
              props: {
                label: I18N?.DDD?.Silent ?? 'Silent'
              }
            },
            {
              className,
              key: 'shading',
              type: 'select',
              props: {
                label: I18N?.DDD?.Shading ?? 'Shading',
                options: [
                  { value: null, label: 'None' },
                  { value: 'color', label: 'color' },
                  { value: 'lambert', label: 'lambert' },
                  { value: 'realistic', label: 'realistic' }
                ]
              }
            }
          ]
        },
        ...AccordionWrappers([
          {
            key: 'itemStyle',
            label: I18N?.DDD?.ItemStyle ?? 'Item Style',
            fieldGroup: [
              {
                fieldGroupClassName: FORMLY_ROW,
                fieldGroup: [SingleColor(className, I18N), Opacity(className, I18N)]
              }
            ]
          },
        ]),
        ...Common3D(className, I18N)
      ]
    }
  ])
}

function Label(className: string, I18N) {
  return [
    {
      fieldGroupClassName: FORMLY_ROW,
      fieldGroup: [
        {
          className,
          key: 'show',
          type: 'toggle',
          props: {
            label: I18N?.DDD?.Show ?? 'Show'
          }
        },
        {
          className,
          key: 'distance',
          type: 'number',
          props: {
            label: I18N?.DDD?.Distance ?? 'Distance'
          }
        },
        {
          className,
          key: 'formatter',
          type: 'input',
          props: {
            label: I18N?.DDD?.Formatter ?? 'Formatter'
          }
        }
      ]
    },
    {
      key: 'textStyle',
      wrappers: ['panel'],
      props: {
        label: I18N?.DDD?.TextStyle ?? 'Text Style'
      },
      fieldGroup: [
        {
          fieldGroupClassName: FORMLY_ROW,
          fieldGroup: TextStyles(className, I18N)
        }
      ]
    }
  ]
}

export function Common3D(className: string, I18N) {
  return AccordionWrappers([
    {
      key: 'label',
      label: I18N?.DDD?.Label ?? 'Label',
      fieldGroup: Label(className, I18N)
    },
    {
      key: 'emphasis',
      label: I18N?.DDD?.Emphasis ?? 'Emphasis',
      fieldGroup: [
        {
          key: 'itemStyle',
          wrappers: ['panel'],
          props: {
            label: I18N?.DDD?.ItemStyle ?? 'Item Style'
          },
          fieldGroup: [
            {
              fieldGroupClassName: FORMLY_ROW,
              fieldGroup: [SingleColor(className, I18N), Opacity(className, I18N)]
            }
          ]
        },

        {
          key: 'label',
          wrappers: ['panel'],
          props: {
            label: I18N?.DDD?.Label ?? 'Label'
          },
          fieldGroup: Label(className, I18N)
        }
      ]
    }
  ])
}