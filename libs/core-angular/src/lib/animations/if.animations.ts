import { animate, style, transition, trigger } from '@angular/animations'

export const IfAnimation = trigger('ifAnimationTrigger', [
  transition(':enter', [style({opacity: 0}), animate('100ms', style({opacity: 1}))]),
  transition(':leave', [style({position: 'absolute'}), animate('100ms', style({opacity: 0}))]),
])

export const HeightChangeAnimation = trigger('heightChangeAnimation', [
  transition(':enter', [
    style({ height: '0', opacity: 0 }),
    animate('200ms ease-out', style({ height: '*', opacity: 1 }))
  ]),
  transition(':leave', [
    animate('200ms ease-in', style({ height: '0', opacity: 0 }))
  ])
])

export const SlideUpAnimation = trigger('slideUpAnimation', [
  transition(':enter', [
    style({ transform: 'translateY(100%)', opacity: 0 }),
    animate('300ms ease-out', style({ transform: 'translateY(0)', opacity: 1 }))
  ]),
  transition(':leave', [
    style({ position: 'absolute', }),
    animate('100ms ease-in', style({ transform: 'translateY(-100%)', opacity: 0 }))
  ])
])

export const SlideUpDownAnimation = trigger('slideUpDown', [
  transition(':enter', [
    style({ transform: 'translateY(100%)', opacity: 0 }),
    animate('100ms ease-in', style({ transform: 'translateY(0)', opacity: 1 }))
  ]),
  transition(':leave', [
    style({ position: 'absolute', }),
    animate('100ms ease-in', style({ transform: 'translateY(100%)', opacity: 0 }))
  ])
])

export const LeanRightEaseInAnimation = trigger('leanRightEaseIn', [
  transition(':enter', [
    style({ transform: 'translateX(-20%)', opacity: 0 }),
    animate('{{ timing }} ease-in', style({ transform: 'translateX(0)', opacity: 1 }))
  ], { params: { timing: '100ms' } }),
  transition(':leave', [
    style({ }),
    animate('{{ timing }} ease-out', style({ opacity: 0 }))
  ], { params: { timing: '100ms' } })
])

export const IfAnimations = [
  HeightChangeAnimation,
  IfAnimation,
  SlideUpAnimation
]
