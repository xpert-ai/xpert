import { booleanAttribute, computed, Directive, input } from '@angular/core'

/**
 * Defines the posible values of the components' display density.
 */
export enum DisplayDensity {
  comfortable = 'comfortable',
  cosy = 'cosy',
  compact = 'compact'
}

@Directive({
  standalone: true,
  selector: '[xpDensity],[xp-density]',
  host: {
    '[class.xp-density__cosy]': 'cosy()',
    '[class.xp-density__compact]': 'small()',
    '[class.small]': 'small()',
    '[class.xp-density__comfortable]': 'large()',
    '[class.large]': 'large()',
    '[class]': 'xpDensity()'
  }
})
export class XpDensityDirective {
  readonly xpDensity = input<string>(null, {
    alias: 'xp-density'
  })

  readonly small = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })
  readonly large = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })

  readonly cosy = computed(() => !this.xpDensity() && !this.small() && !this.large())
}
