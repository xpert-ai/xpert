import { animate, style, transition, trigger } from '@angular/animations'


export const OverlayAnimation1 = trigger('overlayAnimation1', [
    transition(':enter', [
      style({ opacity: 0, transform: 'scale(0.95)' }), 
      animate('100ms', style({ opacity: 1, transform: 'scale(1)' }))
    ]),
    transition(':leave', [
      animate('100ms', style({ opacity: 0, transform: 'scale(0.95)' }))
    ]),
  ])

export const SlideLeftRightAnimation = trigger('slideLeftRight', [
  transition(':enter', [
    style({ transform: 'translateX(50%)', opacity: 0 }),
    animate('200ms ease-in', style({ transform: 'translateX(0)', opacity: 1 }))
  ]),
  transition(':leave', [
    style({ position: 'absolute', }),
    animate('200ms ease-out', style({ transform: 'translateX(50%)', opacity: 0 }))
  ])
])

export const OverlayAnimations = [
  OverlayAnimation1,
  SlideLeftRightAnimation
]
