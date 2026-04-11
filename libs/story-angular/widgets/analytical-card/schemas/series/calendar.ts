import { AccordionWrappers, FORMLY_ROW } from '@xpert-ai/story/designer'
import { LineStyle } from '../axis'
import { Borders, Opacity, Positions, Shadows, SingleColor } from '../common'

export function CalendarCapacity(className: string, I18N?) {
  return AccordionWrappers([
    {
      key: 'calendar',
      label: I18N?.Calendar?.Title ?? 'Calendar',
      fieldGroup: [
        {
          fieldGroupClassName: FORMLY_ROW,
          fieldGroup: [
            ...Positions(className, I18N),

            {
              key: 'cellSize',
              type: 'json',
              templateOptions: {
                label: I18N?.Calendar?.CellSize ?? 'Cell Size',
                placeholder: `number | 'auto' | [number, 'auto']`
              }
            },

            ...AccordionWrappers([
              {
                key: 'splitLine',
                label: I18N?.SplitLine?.Title ?? 'Split Line',
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
              },
              {
                key: 'itemStyle',
                label: I18N?.ItemStyle?.Title ?? 'Item Style',
                fieldGroup: [
                  {
                    fieldGroupClassName: FORMLY_ROW,
                    fieldGroup: [
                      SingleColor(className, I18N),
                      ...Borders(className, I18N),
                      ...Shadows(className, I18N),
                      Opacity(className, I18N)
                    ]
                  }
                ]
              }
            ])
          ]
        }
      ]
    }
  ])
}
