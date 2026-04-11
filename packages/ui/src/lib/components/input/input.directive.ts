import {
  booleanAttribute,
  computed,
  Directive,
  effect,
  ElementRef,
  forwardRef,
  inject,
  input,
  linkedSignal,
  model,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

import type { ClassValue } from 'clsx';

import { mergeClasses } from '../../utils/merge-classes';

import {
  inputVariants,
  type ZardInputSizeVariants,
  type ZardInputStatusVariants,
  type ZardInputTypeVariants,
} from './input.variants';

@Directive({
  selector: 'input[z-input], textarea[z-input]',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ZardInputDirective),
      multi: true,
    },
  ],
  host: {
    '[class]': 'classes()',
    '(input)': 'updateValue($event.target)',
    '(blur)': 'markAsTouched()',
  },
  exportAs: 'zInput',
})
export class ZardInputDirective implements ControlValueAccessor {
  private readonly elementRef = inject(ElementRef);
  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  readonly class = input<ClassValue>('');
  readonly zBorderless = input(false, { transform: booleanAttribute });
  readonly zSize = input<ZardInputSizeVariants>('default');
  readonly zStatus = input<ZardInputStatusVariants>();
  readonly value = model<string>('');

  readonly size = linkedSignal<ZardInputSizeVariants>(() => this.zSize());

  protected readonly classes = computed(() =>
    mergeClasses(
      inputVariants({
        zType: this.getType(),
        zSize: this.size(),
        zStatus: this.zStatus(),
        zBorderless: this.zBorderless(),
      }),
      this.class(),
    ),
  );

  constructor() {
    effect(() => {
      const value = this.value();

      if (value !== undefined && value !== null) {
        this.elementRef.nativeElement.value = value;
      }
    });
  }

  disable(b: boolean): void {
    this.elementRef.nativeElement.disabled = b;
  }

  writeValue(value: string | null | undefined): void {
    this.value.set(value ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disable(isDisabled);
  }

  setDataSlot(name: string): void {
    if (this.elementRef?.nativeElement?.dataset) {
      this.elementRef.nativeElement.dataset.slot = name;
    }
  }

  protected updateValue(target: EventTarget | null): void {
    const el = target as HTMLInputElement | HTMLTextAreaElement | null;
    const value = el?.value ?? '';
    this.value.set(value);
    this.onChange(value);
  }

  protected markAsTouched(): void {
    this.onTouched();
  }

  getType(): ZardInputTypeVariants {
    const isTextarea = this.elementRef.nativeElement.tagName.toLowerCase() === 'textarea';
    return isTextarea ? 'textarea' : 'default';
  }
}
