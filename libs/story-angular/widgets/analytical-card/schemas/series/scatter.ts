import { AccordionWrappers, FORMLY_ROW } from '@xpert-ai/story/designer'
import {
  BackgroundStyleAccordionWrappers,
  EmphasisAccordionWrappers,
  ItemStyleAccordionWrappers,
  MarkLineAccordionWrappers,
  SelectAccordionWrappers,
  SeriesCommon,
  Symbols
} from '../common'
import { LabelAccordionWrappers, LabelLayoutAccordionWrappers, LabelLineAccordionWrappers } from './label'

export function ScatterCapacity(className: string, I18N) {
  return AccordionWrappers([
    {
      key: 'seriesStyle',
      label: I18N?.SeriesStyle?.Title ?? 'Series Attributes',
      fieldGroup: [
        {
          fieldGroupClassName: FORMLY_ROW,
          fieldGroup: [
            ...SeriesCommon(className, I18N).fieldGroup,
            ...Symbols(className, I18N),
            {
              className,
              key: 'roundCap',
              type: 'checkbox',
              props: {
                label: I18N?.Bar?.RoundCap ?? 'Round Cap'
              }
            }
          ]
        },

        ...ItemStyleAccordionWrappers(className, I18N),
        ...LabelAccordionWrappers(className, I18N),
        ...LabelLineAccordionWrappers(className, I18N),
        ...LabelLayoutAccordionWrappers(className, I18N),
        ...EmphasisAccordionWrappers(className, I18N),
        ...SelectAccordionWrappers(className, I18N),
        ...MarkLineAccordionWrappers(className, I18N),
        ...BackgroundStyleAccordionWrappers(className, I18N)
      ]
    }
  ])
}
