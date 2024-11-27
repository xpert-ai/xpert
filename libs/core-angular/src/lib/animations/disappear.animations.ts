import { animate, style, transition, trigger } from '@angular/animations'

export const Disappear1 = trigger('disappear1', [
  transition(':leave', [animate('100ms', style({ opacity: 0, transform: 'scale(0.8)' }))])
])

export const DisappearAnimations = [Disappear1]
