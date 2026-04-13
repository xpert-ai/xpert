import { ColorPalettes } from '@xpert-ai/core'
import { AccordionWrappers } from '@xpert-ai/story/designer'

export function ColorCapacity(className?, I18N?) {
  return AccordionWrappers([
    {
      key: 'colors',
      label: I18N?.GLOBAL_COLORS?.TITLE ?? 'Global Colors',
      fieldGroup: [
        {
          key: 'color',
          type: 'colors',
          props: {
            label: I18N?.GLOBAL_COLORS?.ColorList ?? 'Colors',
            options: [
              ...ColorPalettes
            ]
          }
        },
        // {
        //   key: 'color',
        //   type: 'array',
        //   props: {
        //     label: I18N?.GLOBAL_COLORS?.ColorList ?? 'Colors'
        //   },
        //   fieldArray: {
        //     type: 'color',
        //     props: {
        //       label: I18N?.GLOBAL_COLORS?.Color ?? 'Color'
        //     }
        //   }
        // }
      ]
    }
  ])
}
