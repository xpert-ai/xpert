import { animate, style, transition, trigger } from '@angular/animations'

export function provideFadeAnimation(timings = '300ms') {
  return trigger('fadeAnimation', [
    transition(':enter', [style({ opacity: 0 }), animate(timings, style({ opacity: 1 }))]),
    transition(':leave', [animate(timings, style({ opacity: 0 }))])
  ])
}

export const fadeAnimation = provideFadeAnimation()