import { NxStoryService } from '@xpert-ai/story/core'
import { map } from 'rxjs/operators'
import { BackgroundProperties, Borders, BoxShadow, FORMLY_ROW, FontCss, Layout, Size } from './types'

// export function StylingWidgetSchema(className: string, DESIGNER) {
//   return {
//     key: 'widget',
//     wrappers: ['expansion'],
//     templateOptions: {
//       label: DESIGNER?.Common?.Widget ?? 'Widget',
//       expanded: true
//     },
//     fieldGroup: StylingCssSchema(className, DESIGNER)
//   }
// }

export function StylingCssSchema(className: string, DESIGNER) {
  return [
    {
      wrappers: ['panel'],
      templateOptions: {
        label: DESIGNER?.STYLING?.CSS?.BACKGROUND?.TITLE ?? 'Background'
      },
      fieldGroupClassName: FORMLY_ROW,
      fieldGroup: [...BackgroundProperties(className, DESIGNER?.STYLING?.CSS?.BACKGROUND)]
    },
    {
      wrappers: ['panel'],
      templateOptions: {
        label: DESIGNER?.STYLING?.CSS?.BOX?.TITLE ?? 'Box'
      },
      fieldGroupClassName: FORMLY_ROW,
      fieldGroup: [BoxShadow(className, DESIGNER?.STYLING?.CSS?.BOX), ...Borders(className, DESIGNER?.STYLING?.CSS?.BOX)]
    },
    {
      wrappers: ['panel'],
      templateOptions: {
        label: DESIGNER?.STYLING?.CSS?.LAYOUT?.TITLE ?? 'Layout'
      },
      fieldGroupClassName: FORMLY_ROW,
      fieldGroup: [...Layout(6, DESIGNER?.STYLING?.CSS?.LAYOUT)]
    },
    {
      wrappers: ['panel'],
      templateOptions: {
        label: DESIGNER?.STYLING?.CSS?.SIZE?.TITLE ?? 'Size'
      },
      fieldGroupClassName: FORMLY_ROW,
      fieldGroup: Size(className, DESIGNER?.STYLING?.CSS?.SIZE)
    },
    {
      wrappers: ['panel'],
      templateOptions: {
        label: DESIGNER?.STYLING?.CSS?.FONT?.TITLE ?? 'Font'
      },
      fieldGroupClassName: FORMLY_ROW,
      fieldGroup: FontCss('ngm-formly__col ngm-formly__col-4', DESIGNER?.STYLING?.CSS?.FONT)
    }
  ]
}

export function IntentNavigation(className: string, BUILDER, storyService: NxStoryService) {
  return {
    key: 'intent',
    wrappers: ['panel'],
    fieldGroupClassName: FORMLY_ROW,
    props: {
      label: BUILDER?.Common?.IntentNavigation ?? 'Intent Navigation'
    },
    fieldGroup: [
      {
        className,
        key: 'semanticObject',
        type: 'select-inline',
        props: {
          placeholder: BUILDER?.Common?.NavigationType ?? 'Navigation Type',
          options: [
            {
              value: null,
              label: BUILDER?.Common?.None ?? 'None'
            },
            {
              value: 'StoryPoint',
              label: BUILDER?.Common?.StoryPoint ?? 'Story Point'
            }
          ]
        }
      },
      {
        className,
        key: 'action',
        type: 'select-inline',
        props: {
          placeholder: BUILDER?.Common?.Page ?? 'Page',
          options: storyService.displayPoints$.pipe(
            map((points) => {
              return points.map((point) => ({
                value: point.key,
                label: point.name
              }))
            })
          )
        }
      }
    ]
  }
}
