import { AccordionWrappers, FORMLY_ROW } from "@xpert-ai/story/designer"

export function PolarCapacity(className: string, I18N) {
  return AccordionWrappers([
    {
      key: 'polar',
      label: I18N?.Polar?.Title ?? 'Polar',
      fieldGroup: [
        {
          fieldGroupClassName: FORMLY_ROW,
          fieldGroup: [
            {
              key: 'radius',
              type: 'json',
              className,
              props: {
                label: I18N?.Common?.Radius ?? 'Radius',
                placeholder: '[number, number]',
                autosize: true,
              }
            }
          ]
        }
      ]
    }
  ])
}
