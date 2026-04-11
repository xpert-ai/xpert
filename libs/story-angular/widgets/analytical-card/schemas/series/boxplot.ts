import { AccordionWrappers, FORMLY_ROW } from '@xpert-ai/story/designer'
import { EmphasisAccordionWrappers, ItemStyleAccordionWrappers, SeriesCommon } from '../common'

export function BoxplotCapacity(className: string, I18N) {
  return AccordionWrappers([
    {
      key: 'seriesStyle',
      label: I18N?.SeriesStyle?.Title ?? 'Series Attributes',
      fieldGroup: [
        {
          fieldGroupClassName: FORMLY_ROW,
          fieldGroup: [
            ...SeriesCommon(className, I18N).fieldGroup,
            {
              className,
              key: 'boxWidth',
              type: 'json',
              props: {
                label: I18N?.Boxplot?.BoxWidth ?? 'Box Width',
                placeholder: '[min, max]'
              }
            }
          ]
        },
        ...ItemStyleAccordionWrappers(className, I18N),
        ...EmphasisAccordionWrappers(className, I18N)
      ]
    }
  ])
}
