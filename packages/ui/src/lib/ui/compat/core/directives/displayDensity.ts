import { booleanAttribute, computed, Directive, HostBinding, input, Input } from '@angular/core'

/**
 * Defines the posible values of the components' display density.
 */
export enum DisplayDensity {
  comfortable = 'comfortable',
  cosy = 'cosy',
  compact = 'compact'
}

/**
 * @deprecated use hostDirectives {@link XpDensityDirective }.
 *
 * 组件的 display density 配置
 *
 * [Guidance on high-density spacing](https://material.io/design/layout/applying-density.html)
 */
@Directive({
  standalone: true,
  selector: '[displayDensity]'
})
export class DensityDirective {
  @Input() displayDensity: DisplayDensity | string

  @HostBinding('class.xp-density__comfortable')
  get densityCosy(): boolean {
    return this.displayDensity === DisplayDensity.comfortable
  }

  @HostBinding('class.xp-density__compact')
  get densityCompact(): boolean {
    return this.displayDensity === DisplayDensity.compact
  }

  @HostBinding('class.xp-density__cosy')
  get densityComfortable(): boolean {
    return this.displayDensity === DisplayDensity.cosy
  }
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
