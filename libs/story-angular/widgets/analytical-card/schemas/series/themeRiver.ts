import { AccordionWrappers, FORMLY_ROW } from '@xpert-ai/story/designer'
import { EmphasisAccordionWrappers, ItemStyleAccordionWrappers, Positions, SeriesCommon, WidthHeight } from '../common'
import { LabelAccordionWrappers, LabelLineAccordionWrappers } from './label'

export function ThemeRiverCapacity(className: string, I18N) {
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
              key: 'boundaryGap',
              type: 'json',
              props: {
                label: I18N?.SeriesStyle?.BoundaryGap ?? 'Boundary Gap',
                placeholder: '["10%", "10%"]',
                autosize: true
              }
            },
            ...SeriesCommon(className, I18N).fieldGroup,
            ...Positions(className, I18N),
            ...WidthHeight(className, I18N),
          ]
        },
        ...ItemStyleAccordionWrappers(className, I18N),
        ...LabelAccordionWrappers(className, I18N),
        ...LabelLineAccordionWrappers(className, I18N),
        ...EmphasisAccordionWrappers(className, I18N),
      ]
    }
  ])
}
