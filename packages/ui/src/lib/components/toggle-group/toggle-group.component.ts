import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChildren,
  forwardRef,
  inject,
  InjectionToken,
  input,
  output,
  signal,
  type Signal,
  viewChildren,
  ViewEncapsulation,
} from '@angular/core';
import { type ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

import type { ClassValue } from 'clsx';

import { ZardIconComponent } from '@/src/lib/components/icon/icon.component';
import type { ZardIcon } from '@/src/lib/components/icon/icons';
import { mergeClasses } from '@/shared/utils/merge-classes';

import {
  toggleGroupItemVariants,
  toggleGroupVariants,
  type ZardToggleGroupMode,
  type ZardToggleGroupOrientation,
  type ZardToggleGroupSize,
  type ZardToggleGroupType,
} from './toggle-group.variants';

const UNSET_VALUE = Symbol('z-toggle-group-unset');

const booleanOrNullAttribute = (value: unknown): boolean | null => {
  if (value === null || value === undefined) {
    return null;
  }

  return booleanAttribute(value);
};

type OnTouchedType = () => void;
type OnChangeType = (value: unknown) => void;

export interface ZardToggleGroupChange<T = unknown> {
  value: T | T[];
}

export interface ZardToggleGroupItem {
  value: unknown;
  label?: string;
  icon?: ZardIcon;
  disabled?: boolean;
  ariaLabel?: string;
}

export interface ZardToggleGroupApi {
  readonly disabled: Signal<boolean>;
  readonly itemComponents: Signal<readonly unknown[]>;
  readonly orientation: Signal<ZardToggleGroupOrientation>;
  readonly zSize: Signal<ZardToggleGroupSize>;
  readonly zType: Signal<ZardToggleGroupType>;
  isItemSelected(value: unknown): boolean;
  toggleItem(value: unknown): void;
  touch(): void;
}

export const ZARD_TOGGLE_GROUP = new InjectionToken<ZardToggleGroupApi>('ZARD_TOGGLE_GROUP');

@Component({
  selector: 'z-toggle-group-item, [z-toggle-group-item]',
  template: `<ng-content />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'classes()',
    '[attr.aria-disabled]': 'disabled() ? "true" : null',
    '[attr.aria-label]': 'ariaLabel() || null',
    '[attr.aria-pressed]': 'checked()',
    '[attr.data-disabled]': 'disabled() ? "" : null',
    '[attr.data-orientation]': 'orientation()',
    '[attr.data-state]': 'checked() ? "on" : "off"',
    '[attr.role]': '"button"',
    '[attr.tabindex]': 'disabled() ? -1 : 0',
    '(blur)': 'onBlur()',
    '(click)': 'onClick($event)',
    '(keydown)': 'onKeydown($event)',
  },
  exportAs: 'zToggleGroupItem',
})
export class ZardToggleGroupItemComponent {
  private readonly group = inject(ZARD_TOGGLE_GROUP, { optional: true });

  readonly value = input<unknown>(null);
  readonly class = input<ClassValue>('');
  readonly disabledInput = input(false, { alias: 'disabled', transform: booleanAttribute });
  readonly ariaLabel = input<string>('', { alias: 'aria-label' });

  protected readonly disabled = computed(() => this.disabledInput() || (this.group?.disabled() ?? false));
  protected readonly checked = computed(() => this.group?.isItemSelected(this.value()) ?? false);
  protected readonly orientation = computed<ZardToggleGroupOrientation>(() => this.group?.orientation() ?? 'horizontal');

  protected readonly classes = computed(() => {
    const items = this.group?.itemComponents() ?? [this];
    const index = Math.max(items.indexOf(this), 0);
    const total = items.length || 1;
    const isOutline = (this.group?.zType() ?? 'default') === 'outline';
    const orientation = this.orientation();

    return mergeClasses(
      'z-toggle-group-item',
      toggleGroupItemVariants({
        orientation,
        zSize: this.group?.zSize() ?? 'md',
        zType: this.group?.zType() ?? 'default',
      }),
      orientation === 'horizontal'
        ? ['first:rounded-l-md', 'last:rounded-r-md']
        : ['first:rounded-t-md', 'last:rounded-b-md'],
      isOutline && orientation === 'horizontal' && index > 0 ? 'border-l-0' : '',
      isOutline && orientation === 'vertical' && index > 0 ? 'border-t-0' : '',
      total === 1 ? 'rounded-md' : '',
      this.class(),
    );
  });

  onBlur(): void {
    this.group?.touch();
  }

  onClick(event: Event): void {
    event.stopPropagation();

    if (this.disabled()) {
      return;
    }

    this.group?.toggleItem(this.value());
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (this.disabled()) {
      return;
    }

    this.group?.toggleItem(this.value());
  }
}

@Component({
  selector: 'z-toggle-group',
  imports: [ZardIconComponent, ZardToggleGroupItemComponent],
  standalone: true,
  template: `
    @if (!projectedItems().length) {
      @for (item of items(); track $index) {
        <z-toggle-group-item
          [value]="item.value"
          [disabled]="item.disabled"
          [aria-label]="item.ariaLabel || ''"
        >
          @if (item.icon) {
            <span z-icon [zType]="item.icon" class="size-4 shrink-0"></span>
          }
          @if (item.label) {
            <span>{{ item.label }}</span>
          } @else if (!item.icon) {
            <span>{{ item.value }}</span>
          }
        </z-toggle-group-item>
      }
    }

    <ng-content />
  `,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ZardToggleGroupComponent),
      multi: true,
    },
    {
      provide: ZARD_TOGGLE_GROUP,
      useExisting: forwardRef(() => ZardToggleGroupComponent),
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[attr.aria-disabled]': 'disabled() ? "true" : null',
    '[attr.data-color]': 'color()',
    '[attr.data-disabled]': 'disabled() ? "" : null',
    '[attr.data-orientation]': 'orientation()',
    '[attr.data-z-size]': 'zSize()',
    '[attr.data-z-type]': 'zType()',
    '[class]': 'classes()',
    'role': 'group',
  },
  exportAs: 'zToggleGroup',
})
export class ZardToggleGroupComponent implements ControlValueAccessor, ZardToggleGroupApi {
  readonly projectedItems = contentChildren(ZardToggleGroupItemComponent, { descendants: true });
  private readonly generatedItems = viewChildren(ZardToggleGroupItemComponent);

  readonly zMode = input<ZardToggleGroupMode>('single');
  readonly multiple = input<boolean | null, boolean | string | null | undefined>(null, {
    alias: 'multiple',
    transform: booleanOrNullAttribute,
  });
  readonly zType = input<ZardToggleGroupType>('default');
  readonly zSize = input<ZardToggleGroupSize>('md');
  readonly value = input<unknown | unknown[] | undefined>();
  readonly defaultValue = input<unknown | unknown[] | undefined>();
  readonly disabledInput = input(false, { alias: 'disabled', transform: booleanAttribute });
  readonly vertical = input(false, { transform: booleanAttribute });
  readonly color = input<string | null>(null);
  readonly class = input<ClassValue>('');
  readonly items = input<ZardToggleGroupItem[]>([]);

  readonly change = output<ZardToggleGroupChange>();
  readonly valueChange = output<unknown | unknown[]>();

  private readonly disabledByForm = signal(false);
  private readonly internalValue = signal<unknown | unknown[] | undefined | typeof UNSET_VALUE>(UNSET_VALUE);

  readonly disabled = computed(() => this.disabledInput() || this.disabledByForm());
  readonly orientation = computed<ZardToggleGroupOrientation>(() => (this.vertical() ? 'vertical' : 'horizontal'));
  readonly mode = computed<ZardToggleGroupMode>(() => {
    if (this.multiple() !== null) {
      return this.multiple() ? 'multiple' : 'single';
    }

    return this.zMode();
  });
  readonly itemComponents = computed<readonly unknown[]>(() => {
    const projectedItems = this.projectedItems();

    return projectedItems.length ? projectedItems : this.generatedItems();
  });

  protected readonly classes = computed(() =>
    mergeClasses(
      'z-toggle-group',
      toggleGroupVariants({
        orientation: this.orientation(),
        zType: this.zType(),
      }),
      this.class(),
    ),
  );

  private readonly currentValue = computed(() => {
    const internal = this.internalValue();

    if (internal !== UNSET_VALUE) {
      return internal;
    }

    if (this.value() !== undefined) {
      return this.value();
    }

    if (this.defaultValue() !== undefined) {
      return this.defaultValue();
    }

    return this.mode() === 'multiple' ? [] : null;
  });

  private onTouched: OnTouchedType = () => {
    // ControlValueAccessor onTouched callback
  };
  private onChange: OnChangeType = () => {
    // ControlValueAccessor onChange callback
  };

  isItemSelected(value: unknown): boolean {
    const currentValue = this.currentValue();

    if (this.mode() === 'single') {
      return Object.is(currentValue, value);
    }

    return Array.isArray(currentValue) && currentValue.some((item) => Object.is(item, value));
  }

  toggleItem(value: unknown): void {
    if (this.disabled()) {
      return;
    }

    const currentValue = this.currentValue();
    let nextValue: unknown | unknown[];

    if (this.mode() === 'single') {
      if (Object.is(currentValue, value)) {
        return;
      }

      nextValue = value;
    } else {
      const currentValues = Array.isArray(currentValue) ? currentValue : [];
      nextValue = currentValues.some((item) => Object.is(item, value))
        ? currentValues.filter((item) => !Object.is(item, value))
        : [...currentValues, value];
    }

    this.internalValue.set(nextValue);
    this.valueChange.emit(nextValue);
    this.change.emit({ value: nextValue });
    this.onChange(nextValue);
    this.touch();
  }

  touch(): void {
    this.onTouched();
  }

  writeValue(value: unknown): void {
    this.internalValue.set(value as unknown | unknown[] | undefined);
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
}
