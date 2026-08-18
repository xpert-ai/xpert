import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  forwardRef,
  input,
  linkedSignal,
  output,
  ViewEncapsulation
} from '@angular/core'
import { type ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms'

import { ZardIconComponent } from '../icon'
import { ZardInputDirective } from '../input'
import { ZardInputGroupComponent } from '../input-group'
import type { ZardInputSizeVariants } from '../input/input.variants'

type SearchInputChange = (value: string) => void
type SearchInputTouched = () => void

@Component({
  selector: 'z-search-input',
  imports: [ZardIconComponent, ZardInputDirective, ZardInputGroupComponent],
  template: `
    <ng-template #searchIcon>
      <z-icon zType="search" class="size-4 text-muted-foreground" />
    </ng-template>

    <ng-template #clearButton>
      <button
        type="button"
        class="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        [attr.aria-label]="clearLabel()"
        (click)="clear()"
      >
        <z-icon zType="x" class="size-3.5" />
      </button>
    </ng-template>

    <z-input-group
      class="w-full"
      [zAddonBefore]="searchIcon"
      [zAddonAfter]="zClearable() && inputValue() ? clearButton : ''"
      [zDisabled]="disabled()"
      [zSize]="zSize()"
    >
      <input
        z-input
        type="search"
        class="[&::-webkit-search-cancel-button]:appearance-none"
        [attr.aria-label]="zAriaLabel() || placeholder() || null"
        [attr.autocomplete]="zAutocomplete()"
        [disabled]="disabled()"
        [placeholder]="placeholder()"
        [value]="inputValue()"
        (blur)="handleBlur()"
        (input)="handleInput($event)"
      />
    </z-input-group>
  `,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ZardSearchInputComponent),
      multi: true
    }
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'block',
    'data-slot': 'search-input'
  },
  exportAs: 'zSearchInput'
})
export class ZardSearchInputComponent implements ControlValueAccessor {
  readonly placeholder = input('')
  readonly zAriaLabel = input('', { alias: 'aria-label' })
  readonly zAutocomplete = input('off')
  readonly clearLabel = input('Clear search')
  readonly zDisabled = input(false, { alias: 'disabled', transform: booleanAttribute })
  readonly zClearable = input(true, { transform: booleanAttribute })
  readonly zSize = input<ZardInputSizeVariants>('default')
  readonly value = input('')
  readonly valueChange = output<string>()
  protected readonly disabled = linkedSignal(() => this.zDisabled())
  protected readonly inputValue = linkedSignal(() => this.value())

  private onChange: SearchInputChange = () => undefined
  private onTouched: SearchInputTouched = () => undefined

  protected handleInput(event: Event): void {
    const target = event.target
    if (!(target instanceof HTMLInputElement)) {
      return
    }

    this.setValue(target.value)
  }

  protected handleBlur(): void {
    this.onTouched()
  }

  protected clear(): void {
    this.setValue('')
    this.onTouched()
  }

  writeValue(value: unknown): void {
    this.inputValue.set(typeof value === 'string' ? value : '')
  }

  registerOnChange(fn: SearchInputChange): void {
    this.onChange = fn
  }

  registerOnTouched(fn: SearchInputTouched): void {
    this.onTouched = fn
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled)
  }

  private setValue(value: string): void {
    this.inputValue.set(value)
    this.valueChange.emit(value)
    this.onChange(value)
  }
}
