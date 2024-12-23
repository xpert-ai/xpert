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

export const OverlayAnimations = [
    OverlayAnimation1
]
