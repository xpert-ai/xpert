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
 * @deprecated use hostDirectives {@link NgmDensityDirective }.
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

  @HostBinding('class.ngm-density__comfortable')
  get densityCosy(): boolean {
    return this.displayDensity === DisplayDensity.comfortable
  }

  @HostBinding('class.ngm-density__compact')
  get densityCompact(): boolean {
    return this.displayDensity === DisplayDensity.compact
  }

  @HostBinding('class.ngm-density__cosy')
  get densityComfortable(): boolean {
    return this.displayDensity === DisplayDensity.cosy
  }
}

@Directive({
  standalone: true,
  selector: '[ngmDensity],[ngm-density]',
  host: {
    '[class.ngm-density__cosy]': 'cosy()',
    '[class.ngm-density__compact]': 'small()',
    '[class.small]': 'small()',
    '[class.ngm-density__comfortable]': 'large()',
    '[class.large]': 'large()',
    '[class]': 'ngmDensity()'
  }
})
export class NgmDensityDirective {
  readonly ngmDensity = input<string>(null, {
    alias: 'ngm-density'
  })

  readonly small = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })
  readonly large = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })

  readonly cosy = computed(() => !this.ngmDensity() && !this.small() && !this.large())
}
