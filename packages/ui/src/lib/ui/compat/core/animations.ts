import { Injectable } from '@angular/core'
import { animate, query, sequence, stagger, style, transition, trigger } from '@angular/animations'

export type RouteAnimationType = 'ALL' | 'PAGE' | 'ELEMENTS' | 'NONE'

@Injectable({
  providedIn: 'root'
})
export class AnimationsService {
  private static routeAnimationType: RouteAnimationType = 'ALL'

  static isRouteAnimationsType(type: RouteAnimationType) {
    return AnimationsService.routeAnimationType === type
  }

  updateRouteAnimationType(pageAnimations: boolean, elementsAnimations: boolean) {
    AnimationsService.routeAnimationType =
      pageAnimations && elementsAnimations ? 'ALL' : pageAnimations ? 'PAGE' : elementsAnimations ? 'ELEMENTS' : 'NONE'
  }
}

export const listAnimation = trigger('listAnimation', [
  transition('* <=> *', [
    query(':enter', [style({ opacity: 0 }), stagger('60ms', animate('300ms ease-out', style({ opacity: 1 })))], {
      optional: true
    }),
    query(':leave', animate('100ms', style({ opacity: 0 })), { optional: true })
  ])
])

export const listEnterAnimation = trigger('listEnterAnimation', [
  transition('* <=> *', [
    query(':enter', [style({ opacity: 0 }), stagger('20ms', animate('100ms ease-out', style({ opacity: 1 })))], {
      optional: true
    })
  ])
])

export const ListHeightStaggerAnimation = trigger('listHeightStagger', [
  transition('* <=> *', [
    query(
      ':enter',
      [
        style({ height: '0', opacity: 0 }),
        stagger('20ms', animate('100ms ease-out', style({ height: '*', opacity: 1 })))
      ],
      { optional: true }
    ),
    query(':leave', [stagger('20ms', animate('100ms ease-in', style({ height: '0', opacity: 0 })))], {
      optional: true
    })
  ])
])

export const ListSlideStaggerAnimation = trigger('listSlideStagger', [
  transition('* <=> *', [
    query(
      ':enter',
      [
        style({ transform: 'translateX(-20px)', opacity: 0.5 }),
        stagger('50ms', [animate('100ms ease-out', style({ transform: 'translateX(0)', opacity: 1 }))])
      ],
      { optional: true }
    ),
    query(
      ':leave',
      [stagger('50ms', [animate('300ms ease-in', style({ transform: 'translateX(-20px)', opacity: 0 }))])],
      { optional: true }
    )
  ])
])

const Disappear1 = trigger('disappear1', [
  transition(':leave', [animate('100ms', style({ opacity: 0, transform: 'scale(0.8)' }))])
])

export const DisappearFadeOut = trigger('fadeOut', [transition(':leave', [animate('100ms', style({ opacity: 0 }))])])

const DisappearSlideDown = trigger('slideDown', [
  transition(':leave', [animate('200ms ease-in', style({ opacity: 0, transform: 'translateY(50%)' }))])
])

export const DisappearSlideLeft = trigger('slideLeft', [
  transition(':leave', [animate('500ms', style({ opacity: 0, transform: 'translateX(-60%)' }))])
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

export const IfAnimation = trigger('ifAnimationTrigger', [
  transition(':enter', [style({ opacity: 0 }), animate('100ms', style({ opacity: 1 }))]),
  transition(':leave', [style({ position: 'absolute' }), animate('100ms', style({ opacity: 0 }))])
])

const HeightChangeAnimation = trigger('heightChangeAnimation', [
  transition(':enter', [
    style({ height: '0', opacity: 0 }),
    animate('200ms ease-out', style({ height: '*', opacity: 1 }))
  ]),
  transition(':leave', [animate('200ms ease-in', style({ height: '0', opacity: 0 }))])
])

export const SlideUpAnimation = trigger('slideUpAnimation', [
  transition(':enter', [
    style({ transform: 'translateY(100%)', opacity: 0 }),
    animate('300ms ease-out', style({ transform: 'translateY(0)', opacity: 1 }))
  ]),
  transition(':leave', [
    style({ position: 'absolute' }),
    animate('100ms ease-in', style({ transform: 'translateY(-100%)', opacity: 0 }))
  ])
])

export const SlideUpDownAnimation = trigger('slideUpDown', [
  transition(':enter', [
    style({ transform: 'translateY(100%)', opacity: 0 }),
    animate('100ms ease-in', style({ transform: 'translateY(0)', opacity: 1 }))
  ]),
  transition(':leave', [
    style({ position: 'absolute' }),
    animate('100ms ease-in', style({ transform: 'translateY(100%)', opacity: 0 }))
  ])
])

export const IfAnimations = [HeightChangeAnimation, IfAnimation, SlideUpAnimation]

export const OverlayAnimation1 = trigger('overlayAnimation1', [
  transition(':enter', [
    style({ opacity: 0, transform: 'scale(0.95)' }),
    animate('100ms', style({ opacity: 1, transform: 'scale(1)' }))
  ]),
  transition(':leave', [animate('100ms', style({ opacity: 0, transform: 'scale(0.95)' }))])
])

const SlideLeftRightAnimation = trigger('slideLeftRight', [
  transition(':enter', [
    style({ transform: 'translateX(50%)', opacity: 0 }),
    animate('200ms ease-in', style({ transform: 'translateX(0)', opacity: 1 }))
  ]),
  transition(':leave', [
    style({ position: 'absolute' }),
    animate('200ms ease-out', style({ transform: 'translateX(50%)', opacity: 0 }))
  ])
])

export const OverlayAnimations = [OverlayAnimation1, SlideLeftRightAnimation]

export const ROUTE_ANIMATIONS_ELEMENTS = 'route-animations-elements'

const ROUTE_STEPS_ALL = [
  query(':enter > *', style({ opacity: 0 }), { optional: true }),
  query(`:enter .${ROUTE_ANIMATIONS_ELEMENTS}`, style({ opacity: 0 }), { optional: true }),
  sequence([
    query(
      ':leave',
      [
        style({
          transform: 'translateY(0%)',
          opacity: 1,
          position: 'absolute',
          width: '100%',
          top: 0,
          left: 0
        }),
        animate('.2s ease-in-out', style({ opacity: 0 }))
      ],
      { optional: true }
    ),
    query(
      ':enter > *',
      [
        style({ opacity: 0, width: '100%' }),
        animate('.2s ease-in-out', style({ transform: 'translateY(0%)', opacity: 1 }))
      ],
      { optional: true }
    )
  ]),
  query(
    `:enter .${ROUTE_ANIMATIONS_ELEMENTS}`,
    stagger(75, [style({ opacity: 0 }), animate('.2s ease-in-out', style({ opacity: 1 }))]),
    { optional: true }
  )
]

export const routeAnimations = trigger('routeAnimations', [
  transition(() => AnimationsService.isRouteAnimationsType('ALL'), ROUTE_STEPS_ALL),
  transition(() => AnimationsService.isRouteAnimationsType('NONE'), []),
  transition(() => AnimationsService.isRouteAnimationsType('PAGE'), [ROUTE_STEPS_ALL[0], ROUTE_STEPS_ALL[2]]),
  transition(() => AnimationsService.isRouteAnimationsType('ELEMENTS'), [ROUTE_STEPS_ALL[1], ROUTE_STEPS_ALL[3]])
])
