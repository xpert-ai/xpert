import { FORMLY_ROW } from "@xpert-ai/story/designer"

export function TitleCapacity(className: string, I18N) {
  const showKey = '__showTitle__'
  return [
    {
      key: showKey,
      type: 'empty'
    },
    {
      wrappers: ['accordion'],
      props: {
        elevationZ: true
      },
      fieldGroup: [
        {
          key: 'title',
          hideExpression: `!field.parent.model || !field.parent.model.` + showKey,
          props: {
            label: I18N?.Title?.Title ?? 'Title',
            keyShow: showKey
          },
          fieldGroupClassName: FORMLY_ROW,
          fieldGroup: [
            {
              className,
              key: 'text',
              type: 'input',
              props: {
                label: I18N?.Title?.Text ?? 'Text',
              }
            },
            {
              className,
              key: 'link',
              type: 'input',
              props: {
                label: I18N?.Title?.Link ?? 'Link',
              }
            },
            {
              className,
              key: 'subtext',
              type: 'input',
              props: {
                label: I18N?.Title?.SubText ?? 'SubText',
              }
            },
            {
              className,
              key: 'sublink',
              type: 'input',
              props: {
                label: I18N?.Title?.SubLink ?? 'SubLink',
              }
            },

            {
              className,
              key: 'left',
              type: 'input',
              props: {
                label: I18N?.Title?.Left ?? 'Left',
              }
            },
            {
              className,
              key: 'top',
              type: 'input',
              props: {
                label: I18N?.Title?.Top ?? 'Top',
              }
            },
            {
              className,
              key: 'right',
              type: 'input',
              props: {
                label: I18N?.Title?.Right ?? 'Right',
              }
            },
            {
              className,
              key: 'bottom',
              type: 'input',
              props: {
                label: I18N?.Title?.Bottom ?? 'Bottom',
              }
            },
            {
              className,
              key: 'textAlign',
              type: 'select',
              props: {
                label: I18N?.Common?.TextAlign?.Title ?? 'Title',
                options: [
                  { value: 'auto', label: I18N?.Common?.TextAlign?.Auto ?? 'Auto' },
                  { value: 'left', label: I18N?.Common?.TextAlign?.Left ?? 'Left' },
                  { value: 'right', label: I18N?.Common?.TextAlign?.Right ?? 'Right' },
                  { value: 'center', label: I18N?.Common?.TextAlign?.Center ?? 'Center' }
                ]
              }
            }
          ]
        }
      ]
    }
  ]
}
