import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  inject,
  InjectionToken,
  input,
  output,
  signal,
  type Signal,
  ViewEncapsulation,
} from '@angular/core';
import { type ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

import type { ClassValue } from 'clsx';

import { ZardIdDirective } from '@/shared/core';
import { mergeClasses, noopFn } from '@/shared/utils/merge-classes';

import { radioDotVariants, radioItemVariants, radioLabelVariants, radioVariants, type ZardRadioDensity } from './radio.variants';

type OnTouchedType = () => void;
type OnChangeType = (value: unknown) => void;
let nextUniqueId = 0;

export interface ZardRadioGroupChange<T = any> {
  value: T;
}

export interface ZardRadioGroupApi {
  readonly disabled: Signal<boolean>;
  readonly displayDensity: Signal<ZardRadioDensity>;
  readonly name: Signal<string>;
  readonly selectedValue: Signal<unknown>;
  select(value: unknown): void;
  touch(): void;
}

export const ZARD_RADIO_GROUP = new InjectionToken<ZardRadioGroupApi>('ZARD_RADIO_GROUP');

@Component({
  selector: 'z-radio-group, [z-radio-group]',
  template: `<ng-content />`,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ZardRadioGroupComponent),
      multi: true,
    },
    {
      provide: ZARD_RADIO_GROUP,
      useExisting: forwardRef(() => ZardRadioGroupComponent),
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'z-radio-group',
    role: 'radiogroup',
    '[attr.aria-disabled]': 'disabled()',
    '[attr.data-density]': 'displayDensity()',
  },
  exportAs: 'zRadioGroup',
})
export class ZardRadioGroupComponent implements ControlValueAccessor, ZardRadioGroupApi {
  readonly change = output<ZardRadioGroupChange>();

  readonly displayDensity = input<ZardRadioDensity>('default');
  readonly name = input<string>(`z-radio-group-${nextUniqueId++}`);
  readonly disabledInput = input(false, { alias: 'disabled', transform: booleanAttribute });

  readonly disabledByForm = signal(false);
  readonly disabled = computed(() => this.disabledInput() || this.disabledByForm());
  readonly selectedValue = signal<unknown>(null);

  private onChange: OnChangeType = noopFn;
  private onTouched: OnTouchedType = noopFn;

  writeValue(value: unknown): void {
    this.selectedValue.set(value);
  }

  registerOnChange(fn: OnChangeType): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: OnTouchedType): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabledByForm.set(isDisabled);
  }

  select(value: unknown): void {
    if (this.disabled() || Object.is(this.selectedValue(), value)) {
      return;
    }

    this.selectedValue.set(value);
    this.onChange(value);
    this.change.emit({ value });
  }

  touch(): void {
    this.onTouched();
  }
}

@Component({
  selector: 'z-radio, [z-radio]',
  imports: [ZardIdDirective],
  template: `
    <label [class]="itemClasses()" zardId="radio" #z="zardId">
      <span class="relative flex shrink-0 items-center justify-center">
        <input
          type="radio"
          class="peer sr-only"
          [value]="value()"
          [checked]="checked()"
          [disabled]="disabled()"
          [name]="resolvedName()"
          [id]="zId() || z.id()"
          (change)="onRadioChange($event)"
          (blur)="onRadioBlur()"
        />
        <span [class]="classes()"></span>
        <span [class]="dotClasses()"></span>
      </span>
      <span [class]="labelClasses()">
        <ng-content />
      </span>
    </label>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'z-radio inline-flex max-w-full align-middle',
    '[attr.data-checked]': 'checked() ? "" : null',
    '[attr.data-density]': 'resolvedDisplayDensity()',
    '[attr.data-disabled]': 'disabled() ? "" : null',
  },
  exportAs: 'zRadio',
})
export class ZardRadioComponent {
  private readonly group = inject(ZARD_RADIO_GROUP, { optional: true });
  private readonly defaultName = `z-radio-${nextUniqueId++}`;

  readonly radioChange = output<unknown>();

  readonly class = input<ClassValue>('');
  readonly displayDensity = input<ZardRadioDensity>('default');
  readonly name = input<string>('');
  readonly value = input<unknown>(null);
  readonly checkedInput = input(false, { alias: 'checked', transform: booleanAttribute });
  readonly disabledInput = input(false, { alias: 'disabled', transform: booleanAttribute });
  readonly zId = input<string>('');

  protected readonly resolvedDisplayDensity = computed(() => this.group?.displayDensity() ?? this.displayDensity());
  protected readonly resolvedName = computed(() => this.group?.name() ?? (this.name() || this.defaultName));
  protected readonly checked = computed(() =>
    this.group ? Object.is(this.group.selectedValue(), this.value()) : this.checkedInput(),
  );
  protected readonly disabled = computed(() => this.disabledInput() || (this.group?.disabled() ?? false));

  protected readonly itemClasses = computed(() =>
    mergeClasses(
      radioItemVariants({ displayDensity: this.resolvedDisplayDensity() }),
      this.disabled() ? 'cursor-not-allowed opacity-70' : 'cursor-pointer',
      this.class(),
    ),
  );
  protected readonly classes = computed(() => radioVariants({ displayDensity: this.resolvedDisplayDensity() }));
  protected readonly dotClasses = computed(() => radioDotVariants({ displayDensity: this.resolvedDisplayDensity() }));
  protected readonly labelClasses = computed(() =>
    radioLabelVariants({ displayDensity: this.resolvedDisplayDensity() }),
  );

  onRadioBlur(): void {
    this.group?.touch();
  }

  onRadioChange(event: Event): void {
    event.stopPropagation();

    if (this.disabled()) {
      return;
    }

    this.group?.select(this.value());
    this.radioChange.emit(this.value());
  }
}
