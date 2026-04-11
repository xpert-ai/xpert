import { FORMLY_ROW } from "@xpert-ai/story/designer"

export function GlobalCapacity(className: string, I18N?) {
  return [
    {
      wrappers: ['accordion'],
      props: {
        elevationZ: true
      },
      fieldGroup: [
        {
          props: {
            label: I18N?.Global?.Title ?? 'Global'
          },
          fieldGroupClassName: FORMLY_ROW,
          fieldGroup: [
            {
              className,
              key: 'darkMode',
              type: 'checkbox',
              props: {
                label: I18N?.Global?.DarkMode ?? 'Dark Mode'
              }
            },
            {
              className,
              key: 'backgroundColor',
              type: 'json',
              props: {
                label: I18N?.Global?.BackgroundColor ?? 'Background Color',
                autosize: true
              }
            },
            {
              className,
              key: 'animation',
              type: 'checkbox',
              props: {
                label: I18N?.Global?.Animation ?? 'Animation'
              }
            },
            {
              className,
              key: 'animationThreshold',
              type: 'slider',
              props: {
                label: I18N?.Global?.AnimationThreshold ?? 'Animation Threshold',
                type: 'number',
                thumbLabel: true,
                autoScale: true,
                max: 1000,
                step: 100
              }
            },
            {
              className,
              key: 'animationDuration',
              type: 'slider',
              props: {
                label: I18N?.Global?.AnimationDuration ?? 'Animation Duration',
                type: 'number',
                thumbLabel: true,
                autoScale: true,
                max: 1000,
                step: 100
              }
            },

            {
              className,
              key: 'animationEasing',
              type: 'select-inline',
              props: {
                label: I18N?.Global?.AnimationEasing ?? 'Animation Easing',
                options: AnimationEasing(I18N?.AnimationEasing)
              }
            },

            {
              className,
              key: 'animationDelay',
              type: 'slider',
              props: {
                label: I18N?.Global?.AnimationDelay ?? 'Animation Delay',
                type: 'number',
                thumbLabel: true,
                autoScale: true,
                max: 1000,
                step: 100
              }
            },

            {
              className,
              key: 'animationDurationUpdate',
              type: 'slider',
              props: {
                label: I18N?.Global?.AnimationDurationUpdate ?? 'Animation Duration Update',
                type: 'number',
                thumbLabel: true,
                autoScale: true,
                max: 1000,
                step: 100
              }
            },

            {
              className,
              key: 'animationEasingUpdate',
              type: 'select-inline',
              props: {
                label: I18N?.Global?.AnimationEasingUpdate ?? 'Animation Easing Update',
                options: AnimationEasing(I18N?.AnimationEasing)
              }
            },

            {
              className,
              key: 'animationDelayUpdate',
              type: 'slider',
              props: {
                label: I18N?.Global?.AnimationDelayUpdate ?? 'Animation Delay Update',
                type: 'number',
                thumbLabel: true,
                autoScale: true,
                max: 1000,
                step: 100
              }
            }
          ]
        }
      ]
    }
  ]
}

export function AnimationEasing(I18N: any) {
  return [
    { value: null, label: '--' },
    { value: 'linear', label: I18N?.Linear ?? 'Linear' },
    { value: 'quadraticIn', label: I18N?.QuadraticIn ?? 'QuadraticIn' },
    { value: 'quadraticOut', label: I18N?.QuadraticOut ?? 'QuadraticOut' },
    { value: 'quadraticInOut', label: I18N?.QuadraticInOut ?? 'QuadraticInOut' },
    { value: 'cubicIn', label: I18N?.CubicIn ?? 'CubicIn' },
    { value: 'cubicOut', label: I18N?.CubicOut ?? 'CubicOut' },
    { value: 'cubicInOut', label: I18N?.CubicInOut ?? 'CubicInOut' },
    { value: 'quarticIn', label: I18N?.QuarticIn ?? 'QuarticIn' },
    { value: 'quarticOut', label: I18N?.QuarticOut ?? 'QuarticOut' },
    { value: 'quarticInOut', label: I18N?.QuarticInOut ?? 'QuarticInOut' },
    { value: 'quinticIn', label: I18N?.QuinticIn ?? 'QuinticIn' },
    { value: 'quinticOut', label: I18N?.QuinticOut ?? 'QuinticOut' },
    { value: 'quinticInOut', label: I18N?.QuinticInOut ?? 'QuinticInOut' },
    { value: 'sinusoidalIn', label: I18N?.SinusoidalIn ?? 'SinusoidalIn' },
    { value: 'sinusoidalOut', label: I18N?.SinusoidalOut ?? 'SinusoidalOut' },
    { value: 'sinusoidalInOut', label: I18N?.SinusoidalInOut ?? 'SinusoidalInOut' },
    { value: 'exponentialIn', label: I18N?.ExponentialIn ?? 'ExponentialIn' },
    { value: 'exponentialOut', label: I18N?.ExponentialOut ?? 'ExponentialOut' },
    { value: 'exponentialInOut', label: I18N?.ExponentialInOut ?? 'ExponentialInOut' },
    { value: 'circularIn', label: I18N?.CircularIn ?? 'CircularIn' },
    { value: 'circularOut', label: I18N?.CircularOut ?? 'CircularOut' },
    { value: 'circularInOut', label: I18N?.CircularInOut ?? 'CircularInOut' },
    { value: 'elasticIn', label: I18N?.ElasticIn ?? 'ElasticIn' },
    { value: 'elasticOut', label: I18N?.ElasticOut ?? 'ElasticOut' },
    { value: 'elasticInOut', label: I18N?.ElasticInOut ?? 'ElasticInOut' },
    { value: 'backIn', label: I18N?.BackIn ?? 'BackIn' },
    { value: 'backOut', label: I18N?.BackOut ?? 'BackOut' },
    { value: 'backInOut', label: I18N?.BackInOut ?? 'BackInOut' },
    { value: 'bounceIn', label: I18N?.BounceIn ?? 'BounceIn' },
    { value: 'bounceOut', label: I18N?.BounceOut ?? 'BounceOut' },
    { value: 'bounceInOut', label: I18N?.BounceInOut ?? 'BounceInOut' }
  ]
}
