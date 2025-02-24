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

export const DisappearAnimations = [Disappear1, DisappearFadeOut, DisappearSlideDown]
