import { AccordionWrappers, FORMLY_ROW, FORMLY_W_FULL } from '@xpert-ai/story/designer'
import { ItemStyleAccordionWrappers, Levels, Positions, SeriesCommon, UniversalTransition } from '../common'
import { LabelAccordionWrappers, Labels } from './label'

export function TreemapCapacity(className: string, I18N?) {
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
              key: 'name',
              type: 'input',
              props: {
                label: I18N?.Common?.Name ?? 'Name'
              }
            },

            UniversalTransition(className, I18N),
            ...Positions(className, I18N),

            {
              className,
              key: 'leafDepth',
              type: 'input',
              defaultValue: 2,
              props: {
                label: I18N?.Treemap?.LeafDepth ?? 'Leaf Depth',
                placeholder: 'leafDepth',
                type: 'number'
              }
            },
            {
              className,
              key: 'drillDownIcon',
              type: 'input',
              props: {
                label: I18N?.Treemap?.DrillDownIcon ?? 'DrillDown Icon',
                placeholder: 'drillDownIcon',
                appearance: 'standard'
              }
            },
            {
              className,
              key: 'roam',
              type: 'select',
              props: {
                label: I18N?.Treemap?.DragRoam ?? 'Drag Roaming',
                options: [
                  {
                    value: null,
                    label: I18N?.Treemap?.DragRoam_default ?? 'Default',
                  },
                  {
                    value: false,
                    label: I18N?.Treemap?.DragRoam_false ?? 'Disabled',
                  },
                  {
                    value: 'scale',
                    label: I18N?.Treemap?.DragRoam_scale ?? 'Scale',
                  },
                  {
                    value: 'move',
                    label: I18N?.Treemap?.DragRoam_move ?? 'Move',
                  },{
                    value: true,
                    label: I18N?.Treemap?.DragRoam_all ?? 'All',
                  }
                ],
                appearance: 'standard'
              }
            },
            {
              className,
              key: 'colorAlpha',
              type: 'json',
              props: {
                label: I18N?.Treemap?.ColorAlpha ?? 'Color Alpha',
                placeholder: 'colorAlpha',
                autosize: true,
                autosizeMaxRows: 10
              }
            },
            {
              className,
              key: 'colorSaturation',
              type: 'json',
              props: {
                label: I18N?.Treemap?.ColorSaturation ?? 'Color Saturation',
                placeholder: 'colorSaturation',
                autosize: true,
                autosizeMaxRows: 10
              }
            },
            {
              className,
              key: 'colorMappingBy',
              type: 'select',
              props: {
                label: I18N?.Treemap?.ColorMappingBy ?? 'Color Mapping By',
                placeholder: 'colorMappingBy',
                options: [
                  { value: null, label: 'None' },
                  { value: 'value', label: 'Value' },
                  { value: 'index', label: 'Index' },
                  { value: 'id', label: 'Id' }
                ]
              }
            },

            {
              className,
              key: 'visualMin',
              type: 'input',
              props: {
                label: I18N?.Treemap?.VisualMin ?? 'Visual Min',
                placeholder: 'visualMin'
              },
              expressions: {
                hide: `!model || !model.colorMappingBy || model.colorMappingBy === 'value'`
              }
            },
            {
              className,
              key: 'visualMax',
              type: 'input',
              props: {
                label: I18N?.Treemap?.VisualMax ?? 'Visual Max',
                placeholder: 'visualMax'
              },
              expressions: {
                hide: `!model || !model.colorMappingBy || model.colorMappingBy === 'value'`
              }
            },
            {
              className,
              key: 'visibleMin',
              type: 'input',
              props: {
                label: I18N?.Treemap?.VisibleMin ?? 'Visible Min',
                placeholder: 'visibleMin'
              }
            },
            {
              className,
              key: 'childrenVisibleMin',
              type: 'input',
              props: {
                label: I18N?.Treemap?.ChildrenVisibleMin ?? 'Children Visible Min',
                placeholder: 'childrenVisibleMin'
              }
            },
            ...SeriesCommon(className, I18N).fieldGroup,
            Levels(FORMLY_W_FULL, I18N)
          ]
        },

        ...LabelAccordionWrappers(className, I18N, [
          {
            className: FORMLY_W_FULL,
            key: 'rich',
            type: 'json',
            props: {
              label: 'Rich Text',
              autosize: true,
              autosizeMaxRows: 10
            }
          }
        ]),

        ...AccordionWrappers([
          {
            key: 'upperLabel',
            label: I18N?.Treemap?.UpperLabel ?? 'Upper Label',
            fieldGroup: [
              {
                fieldGroupClassName: FORMLY_ROW,
                fieldGroup: [
                  ...Labels(className, I18N),
                ]
              }
            ]
          }
        ]),

        ...ItemStyleAccordionWrappers(className, I18N, [
          {
            className,
            key: 'gapWidth',
            type: 'input',
            props: {
              label: I18N?.Treemap?.GapWidth ?? 'Gap Width',
              placeholder: 'gapWidth'
            }
          }
        ])
      ]
    }
  ])
}
