import { AccordionWrappers, FORMLY_ROW } from "@xpert-ai/story/designer";
import { Borders, Opacity, SingleColor, Symbols } from "../common";
import { Common3D } from "./bar3D";

export function Scatter3DCapacity(className: string, I18N) {
  return AccordionWrappers([
    {
      key: 'seriesStyle',
      label: I18N?.DDD?.BarSeriesTitle ?? 'Series Attributes',
      fieldGroup: [
        {
          fieldGroupClassName: FORMLY_ROW,
          fieldGroup: [
            ...Symbols(className, I18N),
            {
              className,
              key: 'blendMode',
              type: 'select',
              templateOptions: {
                label: I18N?.DDD?.BlendMode ?? 'Blend Mode',
                options: [
                  { value: null, label: 'None' },
                  { value: 'source-over', label: 'alpha 混合' },
                  { value: 'lighter', label: '叠加模式' },
                ]
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
          ]
        },
        ...AccordionWrappers([
          {
            key: 'itemStyle',
            label: I18N?.DDD?.ItemStyle ?? 'Item Style',
            fieldGroup: [
              {
                fieldGroupClassName: FORMLY_ROW,
                fieldGroup: [
                  SingleColor(className, I18N),
                  Opacity(className, I18N),
                  ...Borders(className, I18N)
                ]
              }
            ]
          },
        ]),
        ...Common3D(className, I18N)
      ]
    }
  ])
}
