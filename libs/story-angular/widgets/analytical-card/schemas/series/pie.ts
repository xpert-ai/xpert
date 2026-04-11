import { AccordionWrappers, FORMLY_ROW } from '@xpert-ai/story/designer'
import {
  Aligns,
  EmphasisAccordionWrappers,
  ItemStyleAccordionWrappers,
  LegendHoverLink,
  Rotate,
  SeriesCommon,
  WidthHeight
} from '../common'
import { LabelLineAccordionWrappers, Labels } from './label'

export function PieCapacity(className: string, I18N) {
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
              key: 'roseType',
              type: 'select',
              props: {
                label: I18N?.Pie?.RoseType ?? 'Rose Type',
                options: [
                  { value: null, label: 'None' },
                  { value: 'radius', label: 'Radius' },
                  { value: 'area', label: 'Area' },
                  { value: 'angle', label: 'Angle' }
                ]
              }
            },
            LegendHoverLink(className, I18N),
            ...CenterRadius(className, I18N),
            {
              className,
              key: 'minShowLabelAngle',
              type: 'input',
              props: {
                type: 'number',
                label: I18N?.Pie?.MinShowLabelAngle ?? 'Min Show Label Angle',
                placeholder: '0 ~ 360'
              }
            },
            {
              className,
              key: 'clockwise',
              type: 'toggle',
              props: {
                label: I18N?.Pie?.Clockwise ?? 'Clockwise'
              }
            },

            {
              className,
              key: 'startAngle',
              type: 'input',
              props: {
                type: 'number',
                label: I18N?.Pie?.StartAngle ?? 'Start Angle',
                placeholder: '0 ~ 360'
              }
            },
            {
              className,
              key: 'minAngle',
              type: 'input',
              props: {
                type: 'number',
                label: I18N?.Pie?.MinAngle ?? 'Min Angle',
                placeholder: '0 ~ 360'
              }
            },
            {
              className,
              key: 'selectedOffset',
              type: 'input',
              props: {
                type: 'number',
                label: I18N?.Pie?.SelectedOffset ?? 'Selected Offset',
                placeholder: 'px'
              }
            },
            {
              className,
              key: 'avoidLabelOverlap',
              type: 'checkbox',
              props: {
                label: I18N?.Pie?.AvoidLabelOverlap ?? 'Avoid Label Overlap'
              }
            },
            {
              className,
              key: 'stillShowZeroSum',
              type: 'checkbox',
              props: {
                label: I18N?.Pie?.StillShowZeroSum ?? 'Still Show Zero Sum'
              }
            },
            {
              className,
              key: 'percentPrecision',
              type: 'number',
              props: {
                label: I18N?.Pie?.PercentPrecision ?? 'Percent Precision'
              }
            }
          ]
        },

        SeriesCommon(className, I18N),

        ...ItemStyleAccordionWrappers(className, I18N),
        ...EmphasisAccordionWrappers(className, I18N, [
          {
            key: 'label',
            wrappers: ['panel'],
            props: {
              label: I18N?.Label?.Title ?? 'Label'
            },
            fieldGroup: [
              {
                fieldGroupClassName: FORMLY_ROW,
                fieldGroup: PieLabel(className, I18N)
              }
            ]
          }
        ]),
        ...AccordionWrappers([
          {
            key: 'label',
            label: I18N?.SERIE_STYLE?.LABEL?.TITLE ?? 'Label',
            fieldGroup: [
              {
                fieldGroupClassName: FORMLY_ROW,
                fieldGroup: PieLabel(className, I18N)
              }
            ]
          }
        ]),

        ...LabelLineAccordionWrappers(className, I18N, [
          {
            className,
            key: 'showAbove',
            type: 'checkbox',
            props: {
              label: I18N?.LabelLine?.ShowAbove ?? 'Show Above'
            }
          },
          {
            className,
            key: 'length',
            type: 'number',
            props: {
              label: I18N?.LabelLine?.FirstLength ?? 'Length of the first segment'
            }
          },
          {
            className,
            key: 'length2',
            type: 'number',
            props: {
              label: I18N?.LabelLine?.SecondLength ?? 'Length of the second segment'
            }
          },
          {
            className,
            key: 'minTurnAngle',
            type: 'number',
            props: {
              label: I18N?.LabelLine?.MinTurnAngle ?? 'Min Turn Angle',
              placeholder: `0 - 180`
            }
          },
          {
            className,
            key: 'maxSurfaceAngle',
            type: 'number',
            props: {
              label: I18N?.LabelLine?.MaxSurfaceAngle ?? 'Max Surface Angle',
              placeholder: `0 - 180`
            }
          }
        ]),

        ...LabelLayoutAccordionWrappers(className, I18N)
      ]
    }
  ])
}

export function PieLabel(className: string, I18N) {
  return [
    ...Labels(className, I18N),
    // {
    //   className: 'ngm-formly__col ngm-formly__col-12',
    //   key: 'show',
    //   type: 'toggle',
    //   props: {
    //     label: I18N?.Common?.Show ?? 'Show'
    //   }
    // },
    {
      className,
      key: 'position',
      type: 'select',
      props: {
        label: I18N?.Common?.Position ?? 'Position',
        options: [
          { value: 'outside', label: 'Outside' },
          { value: 'outer', label: 'Outer' },
          { value: 'inside', label: 'Inside' },
          { value: 'inner', label: 'Inner' },
          { value: 'center', label: 'Center' }
        ]
      }
    },
    // {
    //   className,
    //   key: 'formatter',
    //   type: 'input',
    //   props: {
    //     label: I18N?.Common?.Formatter ?? 'Formatter'
    //   }
    // },

    // {
    //   className,
    //   key: 'rotate',
    //   type: 'checkbox',
    //   props: {
    //     label: I18N?.Common?.Rotate ?? 'Rotate'
    //   }
    // },
    // Rotate(className, I18N),

    ...AlignTo(className, I18N)
  ]
}

export function CenterRadius(className: string, I18N) {
  return [
    {
      className,
      key: 'center',
      type: 'json',
      props: {
        label: I18N?.Pie?.Center ?? 'Center',
        placeholder: 'pixel | percent',
        autosize: true
      }
    },
    {
      className,
      key: 'radius',
      type: 'json',
      props: {
        label: I18N?.Pie?.Radius ?? 'Radius',
        placeholder: '(pixel | percent)[]',
        autosize: true
      }
    }
  ]
}

export function AlignTo(className: string, I18N) {
  return [
    {
      className,
      key: 'alignTo',
      type: 'select',
      props: {
        label: I18N?.Pie?.AlignTo ?? 'AlignTo',
        options: [
          {
            value: 'none',
            label: I18N?.Pie?.AlignTo_none ?? 'Default'
          },
          {
            value: 'labelLine',
            label: I18N?.Pie?.AlignTo_labelLine ?? 'Label Line'
          },
          {
            value: 'edge',
            label: I18N?.Pie?.AlignTo_edge ?? 'Edge'
          }
        ]
      },
      expressions: {
        hide: `!model || model.position !== 'outside'`
      }
    },
    {
      className,
      key: 'edgeDistance',
      type: 'input',
      props: {
        label: I18N?.Pie?.EdgeDistance ?? 'Edge Distance',
        placeholder: 'string | number'
      },
      expressions: {
        hide: `!model || model.position !== 'outside' || model.alignTo !== 'edge'`
      }
    },
    {
      className,
      key: 'bleedMargin',
      type: 'input',
      props: {
        label: I18N?.Pie?.BleedMargin ?? 'Bleed Margin',
        placeholder: 'bleedMargin',
        type: 'number'
      },
      expressions: {
        hide: `!model || model.position !== 'outside' || model.alignTo === 'edge'`
      }
    },
    {
      className,
      key: 'distanceToLabelLine',
      type: 'input',
      props: {
        label: I18N?.Pie?.DistanceToLabelLine ?? 'Distance to Label Line',
        placeholder: 'distanceToLabelLine',
        type: 'number'
      },
      expressions: {
        hide: `!model || model.position !== 'outside' || model.alignTo === 'edge'`
      }
    }
  ]
}

export function LabelLayoutAccordionWrappers(className: string, I18N) {
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
                    value: null,
                    label: I18N?.LabelLayout?.MoveOverlap_none ?? 'None'
                  },
                  {
                    value: 'shiftX',
                    label: I18N?.LabelLayout?.MoveOverlap_shiftX ?? 'Shift X'
                  },
                  {
                    value: 'shiftY',
                    label: I18N?.LabelLayout?.MoveOverlap_shiftY ?? 'Shift Y'
                  }
                ]
              }
            },

            Rotate(className, I18N),
            ...WidthHeight(className, I18N),
            ...Aligns(className, I18N)
          ]
        }
      ]
    }
  ])
}
