import { AccordionWrappers, FORMLY_ROW } from '@xpert-ai/story/designer'
import { LineStyle } from '../axis'
import { Aligns, Borders, Rotate, Shadows, SingleColor, TextBorderShadow, TextOverflow, WidthHeight } from '../common'

export function LabelAccordionWrappers(className: string, I18N, extensions?: any[]) {
  return AccordionWrappers([
    {
      key: 'label',
      label: I18N?.SERIE_STYLE?.LABEL?.TITLE ?? 'Label',
      fieldGroup: [
        {
          fieldGroupClassName: FORMLY_ROW,
          fieldGroup: [...Labels(className, I18N), ...(extensions ?? [])]
        }
      ]
    }
  ])
}

export function Labels(className: string, I18N) {
  return [
    {
      className,
      key: 'show',
      type: 'toggle',
      props: {
        label: I18N?.Common?.Show ?? 'Show'
      }
    },
    {
      className,
      key: 'formatter',
      type: 'textarea',
      props: {
        label: I18N?.Common?.Formatter ?? 'Formatter',
        rows: 1,
        autosize: true
      }
    },

    // {
    //   className,
    //   key: 'position',
    //   type: 'select',
    //   props: {
    //     label: I18N?.Common?.Position ?? 'Position',
    //     options: [
    //       { value: 'top', label: 'Top' },
    //       { value: 'left', label: 'left' },
    //       { value: 'right', label: 'right' },
    //       { value: 'bottom', label: 'bottom' },
    //       { value: 'inside', label: 'inside' },
    //       { value: 'insideLeft', label: 'insideLeft' },
    //       { value: 'insideRight', label: 'insideRight' },
    //       { value: 'insideTop', label: 'insideTop' },
    //       { value: 'insideBottom', label: 'insideBottom' },
    //       { value: 'insideTopLeft', label: 'insideTopLeft' },
    //       { value: 'insideBottomLeft', label: 'insideBottomLeft' },
    //       { value: 'insideTopRight', label: 'insideTopRight' },
    //       { value: 'insideBottomRight', label: 'insideBottomRight' }
    //     ]
    //   }
    // },

    {
      className,
      key: 'rotate',
      type: 'checkbox',
      props: {
        label: I18N?.Common?.Rotate ?? 'Rotate'
      }
    },
    Rotate(className, I18N),
    ...Aligns(className, I18N),
    SingleColor(className, I18N),
    ...Borders(className, I18N),
    ...Shadows(className, I18N),
    ...WidthHeight(className, I18N),
    ...TextBorderShadow(className, I18N),
    ...TextOverflow(className, I18N)
  ]
}

export function LabelLineAccordionWrappers(className: string, I18N, extensions?: any[]) {
  return AccordionWrappers([
    {
      key: 'labelLine',
      label: I18N?.SERIE_STYLE?.LabelLine?.Title ?? 'Label Line',
      fieldGroup: [
        {
          fieldGroupClassName: FORMLY_ROW,
          fieldGroup: [
            {
              className,
              key: 'show',
              type: 'toggle',
              props: {
                label: I18N?.Common?.Show ?? 'Show'
              }
            },
            ...(extensions ?? []),
            {
              className,
              key: 'smooth',
              type: 'checkbox',
              props: {
                label: I18N?.LabelLine?.Smooth ?? 'Smooth'
              }
            }
          ]
        },
        {
          key: 'lineStyle',
          wrappers: ['panel'],
          props: {
            label: I18N?.LineStyle?.Title ?? 'Line Style'
          },
          fieldGroupClassName: FORMLY_ROW,
          fieldGroup: LineStyle(className, I18N)
        }
      ]
    }
  ])
}

export function LabelLayoutAccordionWrappers(className: string, I18N, extensions?: any[]) {
  return AccordionWrappers([
    {
      key: 'labelLayout',
      label: I18N?.LabelLayout?.Title ?? 'Label Layout',
      fieldGroup: [
        {
          fieldGroupClassName: FORMLY_ROW,
          fieldGroup: [
            {
              className,
              key: 'hideOverlap',
              type: 'checkbox',
              props: {
                label: I18N?.LabelLayout?.HideOverlap ?? 'Hide Overlap'
              }
            },
            {
              className,
              key: 'moveOverlap',
              type: 'select',
              props: {
                label: I18N?.LabelLayout?.MoveOverlap ?? 'Move Overlap',
                options: [
                  {
                    value: 'shiftX'
                  },
                  {
                    value: 'shiftY'
                  }
                ]
              }
            },
            {
              className,
              key: 'x',
              type: 'input',
              props: {
                label: I18N?.LabelLayout?.X ?? 'X'
              }
            },
            {
              className,
              key: 'y',
              type: 'input',
              props: {
                label: I18N?.LabelLayout?.Y ?? 'Y'
              }
            },

            ...Aligns(className, I18N),

            ...(extensions ?? []),
          ]
        }
      ]
    }
  ])
}
