import { AccordionWrappers, FORMLY_ROW, FORMLY_W_FULL } from '@xpert-ai/story/designer'
import {
  BlurScope,
  Focus,
  ItemStyleAccordionWrappers,
  Levels,
  Opacity,
  Positions,
  SelectedMode,
  Shadows,
  WidthHeight
} from '../common'
import { LabelAccordionWrappers } from './label'

export function SankeyCapacity(className: string, I18N) {
  return AccordionWrappers([
    {
      key: 'seriesStyle',
      label: I18N?.SeriesStyle?.Title ?? 'Series Attributes',
      fieldGroup: [
        {
          fieldGroupClassName: FORMLY_ROW,
          fieldGroup: [
            {
              className,
              key: 'name',
              type: 'input',
              props: {
                label: I18N?.Common?.Name ?? 'Name'
              }
            },
            ...Positions(className, I18N),
            ...WidthHeight(className, I18N),
            {
              className,
              key: 'nodeWidth',
              type: 'input',
              props: {
                label: I18N?.Sankey?.NodeWidth ?? 'Node Width',
                type: 'number'
              }
            },
            {
              className,
              key: 'nodeGap',
              type: 'input',
              props: {
                label: I18N?.Sankey?.NodeGap ?? 'Node Gap',
                type: 'number'
              }
            },
            {
              className,
              key: 'nodeAlign',
              type: 'select',
              props: {
                label: I18N?.Sankey?.NodeAlign ?? 'Node Align',
                options: [
                  { value: null, label: 'None' },
                  { value: 'left', label: 'Left' },
                  { value: 'right', label: 'Right' },
                  { value: 'justify', label: 'Justify' }
                ]
              }
            },
            {
              className,
              key: 'layoutIterations',
              type: 'input',
              props: {
                label: I18N?.Sankey?.LayoutIterations ?? 'Layout Iterations',
                type: 'number'
              }
            },

            {
              className,
              key: 'draggable',
              type: 'checkbox',
              props: {
                label: I18N?.Sankey?.Draggable ?? 'Draggable'
              }
            },

            SelectedMode(className, I18N),
            Levels(FORMLY_W_FULL, I18N)
          ]
        },

        ...ItemStyleAccordionWrappers(className, I18N),
        ...LabelAccordionWrappers(className, I18N),
        ...AccordionWrappers([
          {
            key: 'emphasis',
            label: I18N?.EMPHASIS?.TITLE ?? 'Emphasis',
            fieldGroup: [
              {
                fieldGroupClassName: FORMLY_ROW,
                fieldGroup: [Focus(className, I18N, {adjacency: true}), BlurScope(className, I18N)]
              }
            ]
          }
        ]),

        {
          key: '__showLineStyle__',
          type: 'empty'
        },

        {
          wrappers: ['accordion'],
          props: {
            elevationZ: true
          },
          fieldGroup: [LineStyle(className, I18N, '__showLineStyle__')]
        }
      ]
    }
  ])
}

function LineStyle(className: string, I18N, keyShow: string) {
  return {
    key: 'lineStyle',
    hideExpression: `!field.form.value.` + keyShow,
    props: {
      label: I18N?.Sankey?.LineStyle ?? 'Line Style',
      toggleable: true,
      keyShow: keyShow
    },
    fieldGroupClassName: FORMLY_ROW,
    fieldGroup: [
      {
        className,
        key: 'color',
        type: 'input',
        props: {
          label: I18N?.Common?.Color ?? 'Color',
          placeholder: 'color'
        }
      },

      Opacity(className, I18N),

      {
        className,
        key: 'curveness',
        type: 'input',
        props: {
          label: I18N?.Sankey?.Curveness ?? 'Curveness',
          type: 'number',
          placeholder: 'curveness'
        }
      },

      ...Shadows(className, I18N)
    ]
  }
}
