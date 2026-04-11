import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  forwardRef,
  input,
  output,
  signal,
  ViewEncapsulation
} from '@angular/core'
import { type ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms'

import type { ClassValue } from 'clsx'

import { ZardIdDirective } from '../../core'
import { mergeClasses, noopFn } from '../../utils/merge-classes'

import {
  checkboxLabelVariants,
  checkboxVariants,
  type ZardCheckboxDisplayDensity,
  type ZardCheckboxShapeVariants,
  type ZardCheckboxSizeVariants,
  type ZardCheckboxTypeVariants
} from './checkbox.variants'
import { ZardIconComponent } from '../icon/icon.component'

type OnTouchedType = () => void
type OnChangeType = (value: boolean) => void

@Component({
  selector: 'z-checkbox, [z-checkbox]',
  imports: [ZardIconComponent, ZardIdDirective],
  template: `
    <main
      class="z-checkbox__control-wrapper relative flex shrink-0 items-center justify-center"
      zardId="checkbox"
      #z="zardId"
    >
      <input
        #input
        type="checkbox"
        name="checkbox"
        [id]="z.id()"
        [class]="controlClasses()"
        [checked]="checked()"
        [indeterminate]="resolvedIndeterminate()"
        [disabled]="disabled()"
        [attr.aria-checked]="ariaChecked()"
        (blur)="onCheckboxBlur()"
        (change)="onCheckboxChange(input.checked)"
      />
      <span [class]="indicatorClasses()">
        @if (resolvedIndeterminate()) {
          <span class="block h-0.5 w-2 rounded-full bg-current"></span>
        } @else {
          <z-icon zType="check" class="size-3" />
        }
      </span>
    </main>
    <label [class]="resolvedLabelClasses()" [for]="z.id()">
      <ng-content />
    </label>
  `,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ZardCheckboxComponent),
      multi: true
    }
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'hostClasses()',
    '[attr.aria-checked]': 'ariaChecked()',
    '[attr.aria-disabled]': 'disabled()',
    '[attr.data-checked]': 'checked() ? "" : null',
    '[attr.data-density]': 'displayDensity()',
    '[attr.data-disabled]': 'disabled() ? "" : null',
    '[attr.data-indeterminate]': 'resolvedIndeterminate() ? "" : null',
    '[attr.data-label-position]': 'labelPosition()'
  },
  exportAs: 'zCheckbox'
})
export class ZardCheckboxComponent implements ControlValueAccessor {
  readonly checkChange = output<boolean>()

  readonly class = input<ClassValue>('')
  readonly controlClass = input<ClassValue>('')
  readonly labelClass = input<ClassValue>('')
  readonly zDisabled = input(false, { transform: booleanAttribute })
  readonly indeterminate = input(false, { transform: booleanAttribute })
  readonly labelPosition = input<'before' | 'after'>('after')
  readonly displayDensity = input<ZardCheckboxDisplayDensity>('default')
  readonly zType = input<ZardCheckboxTypeVariants>('default')
  readonly zSize = input<ZardCheckboxSizeVariants>('default')
  readonly zShape = input<ZardCheckboxShapeVariants>('default')

  private onChange: OnChangeType = noopFn
  private onTouched: OnTouchedType = noopFn
  private readonly localIndeterminate = signal(false)

  protected readonly hostClasses = computed(() =>
    mergeClasses(
      'z-checkbox inline-flex max-w-full items-center gap-2 align-middle',
      this.labelPosition() === 'before' ? 'flex-row-reverse justify-end' : '',
      this.disabled() ? 'cursor-not-allowed' : 'cursor-pointer',
      this.class()
    )
  )

  protected readonly controlClasses = computed(() =>
    mergeClasses(
      checkboxVariants({
        zType: this.zType(),
        zSize: this.zSize(),
        zShape: this.zShape(),
        displayDensity: this.displayDensity()
      }),
      this.controlClass()
    )
  )

  protected readonly ariaChecked = computed(() =>
    this.resolvedIndeterminate() ? 'mixed' : this.checked() ? 'true' : 'false'
  )

  protected readonly indicatorClasses = computed(() =>
    mergeClasses(
      'z-checkbox__indicator text-primary-foreground pointer-events-none absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center transition-opacity',
      this.checked() || this.resolvedIndeterminate() ? 'opacity-100' : 'opacity-0'
    )
  )

  readonly disabledByForm = signal(false)
  protected readonly resolvedIndeterminate = computed(() => this.localIndeterminate())
  protected readonly resolvedLabelClasses = computed(() =>
    mergeClasses(
      checkboxLabelVariants({
        zSize: this.zSize(),
        displayDensity: this.displayDensity()
      }),
      this.labelClass()
    )
  )
  protected readonly disabled = computed(() => this.zDisabled() || this.disabledByForm())
  readonly checked = signal(false)

  constructor() {
    effect(() => {
      this.localIndeterminate.set(this.indeterminate())
    })
  }

  writeValue(val: boolean | null | undefined): void {
    this.checked.set(!!val)
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabledByForm.set(isDisabled)
  }

  registerOnChange(fn: OnChangeType): void {
    this.onChange = fn
  }

  registerOnTouched(fn: OnTouchedType): void {
    this.onTouched = fn
  }

  onCheckboxBlur(): void {
    this.onTouched()
  }

  onCheckboxChange(checked: boolean): void {
    if (this.disabled()) {
      return
    }

    if (this.localIndeterminate()) {
      this.localIndeterminate.set(false)
    }

    this.checked.set(checked)
    this.onChange(checked)
    this.checkChange.emit(checked)
  }
}
