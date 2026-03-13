import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  forwardRef,
  input,
  output,
  signal,
  viewChild,
  ViewEncapsulation
} from '@angular/core'
import { type ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms'

import type { ClassValue } from 'clsx'

import { ZardIdDirective } from '@/shared/core'
import { mergeClasses, noopFn } from '@/shared/utils/merge-classes'

import { switchVariants, type ZardSwitchSizeVariants, type ZardSwitchTypeVariants } from './switch.variants'

type OnTouchedType = () => void
type OnChangeType = (value: boolean) => void

export interface ZardSwitchChange {
  checked: boolean
  source: ZardSwitchComponent
}

const booleanOrUndefined = (value: unknown): boolean | undefined =>
  value === undefined ? undefined : booleanAttribute(value)

@Component({
  selector: 'z-switch',
  imports: [ZardIdDirective],
  template: `
    <button
      #control
      zardId="switch"
      #z="zardId"
      type="button"
      role="switch"
      [id]="id() || z.id()"
      [attr.data-size]="zSize()"
      [attr.data-state]="status()"
      [attr.aria-checked]="checked()"
      [attr.aria-disabled]="disabled()"
      [attr.required]="required() ? '' : null"
      [attr.tabindex]="resolvedTabIndex()"
      [class]="controlClasses()"
      [disabled]="disabled()"
      (blur)="onSwitchBlur()"
      (click)="onSwitchChange()"
    >
      <span
        [attr.data-size]="zSize()"
        [attr.data-state]="status()"
        class="bg-background pointer-events-none block size-5 rounded-full shadow-lg ring-0 transition-transform data-[size=lg]:size-6 data-[size=sm]:size-4 data-[state=checked]:translate-x-5 data-[size=lg]:data-[state=checked]:translate-x-6 data-[size=sm]:data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0 data-[size=lg]:data-[state=unchecked]:translate-x-0 data-[size=sm]:data-[state=unchecked]:translate-x-0"
      ></span>
    </button>

    <label [class]="labelClasses()" [for]="id() || z.id()">
      <ng-content><span class="sr-only">toggle switch</span></ng-content>
    </label>
  `,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ZardSwitchComponent),
      multi: true
    }
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'hostClasses()',
    '[attr.data-checked]': 'checked() ? "" : null',
    '[attr.data-disabled]': 'disabled() ? "" : null',
    '[attr.data-label-position]': 'labelPosition()',
    '[attr.data-size]': 'zSize()'
  },
  exportAs: 'zSwitch'
})
export class ZardSwitchComponent implements ControlValueAccessor {
  readonly change = output<ZardSwitchChange>()

  readonly class = input<ClassValue>('')
  readonly controlClass = input<ClassValue>('')
  readonly labelClass = input<ClassValue>('')
  readonly checkedInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'checked',
    transform: booleanOrUndefined
  })
  readonly disabledInput = input(false, {
    alias: 'disabled',
    transform: booleanAttribute
  })
  readonly id = input<string>('', { alias: 'id' })
  readonly labelPosition = input<'before' | 'after'>('after')
  readonly required = input(false, { transform: booleanAttribute })
  readonly tabIndex = input<number | string | null>(null)
  readonly zSize = input<ZardSwitchSizeVariants>('default')
  readonly zType = input<ZardSwitchTypeVariants>('default')

  private onChange: OnChangeType = noopFn
  private onTouched: OnTouchedType = noopFn
  private readonly controlRef = viewChild.required<ElementRef<HTMLButtonElement>>('control')

  protected readonly status = computed(() => (this.checked() ? 'checked' : 'unchecked'))
  protected readonly disabled = computed(() => this.disabledInput() || this.disabledByForm())
  protected readonly hostClasses = computed(() =>
    mergeClasses(
      'z-switch inline-flex max-w-full items-center gap-2 align-middle',
      this.labelPosition() === 'before' ? 'flex-row-reverse justify-end' : '',
      this.disabled() ? 'cursor-not-allowed' : 'cursor-pointer',
      this.class()
    )
  )
  protected readonly controlClasses = computed(() =>
    mergeClasses(switchVariants({ zType: this.zType(), zSize: this.zSize() }), this.controlClass())
  )
  protected readonly labelClasses = computed(() =>
    mergeClasses(
      'z-switch__label text-sm leading-none font-medium',
      this.disabled() ? 'cursor-not-allowed opacity-70' : 'cursor-pointer',
      this.labelClass()
    )
  )
  protected readonly resolvedTabIndex = computed(() => (this.disabled() ? -1 : (this.tabIndex() ?? 0)))

  readonly disabledByForm = signal(false)
  readonly checked = signal(false)

  constructor() {
    effect(() => {
      const checked = this.checkedInput()

      if (checked !== undefined) {
        this.checked.set(checked)
      }
    })
  }

  writeValue(val: boolean | null | undefined): void {
    this.checked.set(!!val)
  }

  registerOnChange(fn: OnChangeType): void {
    this.onChange = fn
  }

  registerOnTouched(fn: OnTouchedType): void {
    this.onTouched = fn
  }

  focus(): void {
    this.controlRef().nativeElement.focus()
  }

  onSwitchBlur(): void {
    this.onTouched()
  }

  onSwitchChange(): void {
    if (this.disabled()) {
      return
    }

    const checked = !this.checked()

    this.checked.set(checked)
    this.onTouched()
    this.onChange(checked)
    this.change.emit({ checked, source: this })
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabledByForm.set(isDisabled)
  }
}
