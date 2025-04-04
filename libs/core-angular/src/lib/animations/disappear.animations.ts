import { animate, style, transition, trigger } from '@angular/animations'

export const Disappear1 = trigger('disappear1', [
  transition(':leave', [animate('100ms', style({ opacity: 0, transform: 'scale(0.8)' }))])
])

export const DisappearFadeOut = trigger('fadeOut', [
  transition(':leave', [animate('100ms', style({ opacity: 0,}))])
])

export const DisappearSlideDown = trigger('slideDown', [
  transition(':leave', [
    animate('200ms ease-in', style({ opacity: 0, transform: 'translateY(50%)' }))
  ])
])

export const DisappearSlideLeft = trigger('slideLeft', [
  transition(':leave', [
    animate('500ms', style({ opacity: 0, transform: 'translateX(-60%)' }))
  ])
])

export const DisappearBL = trigger('bl', [
  transition(':enter', [
    style({ transform: 'translate(-80%, 30%) scale(0.2)', opacity: 0 }),
    animate('200ms ease-out', style({ transform: 'translate(0, 0) scale(1)', opacity: 1 }))
  ]),
  transition(':leave', [
    animate('200ms ease-in', style({ width: '335px', opacity: 0.5, transform: 'translate(-100%, 30%) scale(0.2)' }))
  ])
])

export const DisappearAnimations = [Disappear1, DisappearFadeOut, DisappearSlideDown, DisappearBL]
