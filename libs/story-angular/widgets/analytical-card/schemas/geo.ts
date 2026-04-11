import { FORMLY_ROW } from '@xpert-ai/story/designer'
import { ItemStyle } from './common'

export function GeoCapacity(className: string, I18N) {
  const showKey = '__showGeo__'
  return [
    {
      key: showKey,
      type: 'empty'
    },
    {
      wrappers: ['accordion'],
      templateOptions: {
        elevationZ: true
      },
      fieldGroup: [
        {
          key: 'geo',
          hideExpression: `!field.parent.model || !field.parent.model.` + showKey,
          templateOptions: {
            label: I18N?.Geo?.Title ?? 'Geo',
            keyShow: showKey
          },
          fieldGroupClassName: FORMLY_ROW,
          fieldGroup: [ItemStyle(className, I18N)]
        }
      ]
    }
  ]
}
