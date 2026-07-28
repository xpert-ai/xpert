import { FocusableOption } from '@angular/cdk/a11y'
import { coerceBooleanProperty } from '@angular/cdk/coercion'
import { Directive, ElementRef, HostBinding, Input } from '@angular/core'
import { Subject } from 'rxjs'

export type XpButtonAppearance =
  | 'filled'
  | 'outline'
  | 'ghost'
  | 'hero'
  | 'acrylic'
  | 'opacity'
  | 'color'
  | 'dashed'
  | 'danger'

@Directive({
  standalone: true,
  selector: '[xpAppearance]',
  host: {
    '(focus)': 'focus()'
  }
})
export class XpAppearanceDirective implements FocusableOption {
  @Input() color: string | null = null
  @Input() xpAppearance: XpButtonAppearance = 'filled'

  /**
   * Sets `outline` appearance
   */
  @Input()
  @HostBinding('class.xp-appearance-outline')
  get outline(): boolean {
    return this.xpAppearance === 'outline'
  }
  set outline(value: boolean) {
    if (coerceBooleanProperty(value)) {
      this.xpAppearance = 'outline'
    }
  }

  @Input()
  @HostBinding('class.xp-appearance-hero')
  get hero(): boolean {
    return this.xpAppearance === 'hero'
  }
  set hero(value: boolean) {
    if (coerceBooleanProperty(value)) {
      this.xpAppearance = 'hero'
    }
  }

  @Input()
  @HostBinding('class.xp-appearance-acrylic')
  get acrylic(): boolean {
    return this.xpAppearance === 'acrylic'
  }
  set acrylic(value: boolean) {
    if (coerceBooleanProperty(value)) {
      this.xpAppearance = 'acrylic'
    }
  }

  @Input()
  @HostBinding('class.xp-appearance-opacity')
  get opacity(): boolean {
    return this.xpAppearance === 'opacity'
  }
  set opacity(value: boolean) {
    if (coerceBooleanProperty(value)) {
      this.xpAppearance = 'opacity'
    }
  }

  @Input()
  @HostBinding('class.xp-appearance-dashed')
  get dashed(): boolean {
    return this.xpAppearance === 'dashed'
  }
  set dashed(value: any) {
    if (coerceBooleanProperty(value)) {
      this.xpAppearance = 'dashed'
    }
  }

  @Input()
  @HostBinding('class.xp-appearance-danger')
  get danger(): boolean {
    return this.xpAppearance === 'danger'
  }
  set danger(value: any) {
    if (coerceBooleanProperty(value)) {
      this.xpAppearance = 'danger'
    }
  }

  /** Emits when the chip is focused. */
  readonly _onFocus = new Subject<any>()

  disabled?: boolean
  /** Whether the chip has focus. */
  _hasFocus = false
  constructor(private readonly elementRef: ElementRef<HTMLElement>) {}

  /** Allows for programmatic focusing of the chip. */
  focus(): void {
    if (!this._hasFocus) {
      this.elementRef.nativeElement.focus()
      this._onFocus.next({ chip: this })
    }
    this._hasFocus = true
  }

  getLabel?(): string {
    throw new Error('Method not implemented.')
  }
}
