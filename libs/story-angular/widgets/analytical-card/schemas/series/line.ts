import { AccordionWrappers, FORMLY_ROW } from '@xpert-ai/story/designer'
import { LineStyle } from '../axis'
import { AreaStyles, EmphasisAccordionWrappers, ItemStyleAccordionWrappers, SeriesCommon, Symbols } from '../common'
import { LabelAccordionWrappers } from './label'

export function LineCapacity(className: string, I18N) {
  return AccordionWrappers([
    {
      key: 'seriesStyle',
      label: I18N?.SeriesStyle?.Title ?? 'Series Attributes',
      fieldGroup: [
        SeriesCommon(className, I18N),
        {
          fieldGroupClassName: FORMLY_ROW,
          fieldGroup: [
            {
              className,
              key: 'showSymbol',
              type: 'checkbox',
              props: {
                label: I18N?.Line?.ShowSymbol ?? 'Show Symbol'
              }
            },
            {
              className,
              key: 'showAllSymbol',
              type: 'checkbox',
              props: {
                label: I18N?.Line?.ShowAllSymbol ?? 'Show All Symbol'
              }
            },

            ...Symbols(className, I18N),

            {
              className,
              key: 'smooth',
              type: 'checkbox',
              props: {
                label: I18N?.Line?.Smooth ?? 'Smooth'
              }
            },

            {
              className,
              key: 'stack',
              type: 'input',
              props: {
                label: I18N?.Line?.Stack ?? 'Stack'
              }
            },
            {
              className,
              key: 'step',
              type: 'select',
              props: {
                label: I18N?.Line?.Step ?? 'Step',
                options: [
                  { value: true, label: 'True' },
                  { value: false, label: 'False' },
                  { value: 'start', label: 'start' },
                  { value: 'middle', label: 'middle' },
                  { value: 'end', label: 'end' }
                ]
              }
            }
          ]
        },
        ...ItemStyleAccordionWrappers(className, I18N),
        ...LabelAccordionWrappers(className, I18N),
        ...EmphasisAccordionWrappers(className, I18N),

        ...AccordionWrappers([
          {
            key: 'areaStyle',
            label: I18N?.Line?.AreaStyle ?? 'Area Style',
            fieldGroup: [
              {
                fieldGroupClassName: FORMLY_ROW,
                fieldGroup: AreaStyles(className, I18N)
              }
            ]
          },
          {
            key: 'lineStyle',
            label: I18N?.LineStyle?.Title ?? 'Line Style',
            fieldGroup: [
              {
                fieldGroupClassName: FORMLY_ROW,
                fieldGroup: LineStyle(className, I18N)
              }
            ]
          }
        ])
      ]
    }
  ])
}
