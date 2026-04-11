import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  inject,
  input,
  model,
  output,
  viewChild,
  ViewEncapsulation,
  type TemplateRef,
} from '@angular/core';
import { NG_VALUE_ACCESSOR, type ControlValueAccessor } from '@angular/forms';

import type { ClassValue } from 'clsx';

import { ZardButtonComponent } from '@/src/lib/components/button';
import type { ZardButtonTypeVariants } from '@/src/lib/components/button';
import { injectUiI18nService } from '@/src/lib/core/i18n/ui-i18n.service';
import type { ZardDatePickerSizeVariants } from '@/src/lib/components/date-picker/date-picker.variants';
import { ZardIconComponent } from '@/src/lib/components/icon';
import { ZardPopoverComponent, ZardPopoverDirective } from '@/src/lib/components/popover';
import { mergeClasses, noopFn } from '@/shared/utils/merge-classes';
import { endOfQuarter, HEIGHT_BY_SIZE, startOfQuarter } from './picker.utils';

@Component({
  selector: 'z-quarter-picker, [z-quarter-picker]',
  imports: [ZardButtonComponent, ZardPopoverComponent, ZardPopoverDirective, ZardIconComponent],
  template: `
    <button
      z-button
      type="button"
      [zType]="zType()"
      [zSize]="zSize()"
      [disabled]="disabled()"
      [class]="buttonClasses()"
      zPopover
      #popoverDirective="zPopover"
      [zContent]="calendarTemplate"
      zTrigger="click"
      (zVisibleChange)="onPopoverVisibilityChange($event)"
      [attr.aria-expanded]="false"
      [attr.aria-haspopup]="true"
      [attr.aria-label]="chooseQuarterAriaLabel()"
    >
      <z-icon zType="calendar" />
      <span [class]="textClasses()">{{ displayText() }}</span>
    </button>

    <ng-template #calendarTemplate>
      <z-popover [class]="popoverClasses()">
        <div class="w-[280px] rounded-lg border bg-popover p-3 text-popover-foreground shadow-md">
          <div class="mb-3 flex items-center justify-between gap-2">
            <button z-button zType="ghost" zSize="sm" type="button" class="size-8 p-0" (click)="shiftYear(-1)" [disabled]="disabled()">
              <z-icon zType="chevron-left" />
            </button>
            <div class="text-sm font-semibold">{{ activeYear() }}</div>
            <button z-button zType="ghost" zSize="sm" type="button" class="size-8 p-0" (click)="shiftYear(1)" [disabled]="disabled()">
              <z-icon zType="chevron-right" />
            </button>
          </div>

          <div class="grid grid-cols-2 gap-2">
            @for (quarter of quarterItems(); track quarter.index) {
              <button
                z-button
                type="button"
                zSize="sm"
                [zType]="quarter.selected ? 'default' : 'ghost'"
                class="justify-center"
                [disabled]="quarter.disabled"
                (click)="selectQuarter(quarter.index)"
              >
                {{ quarter.label }}
              </button>
            }
          </div>
        </div>
      </z-popover>
    </ng-template>
  `,
  providers: [
    DatePipe,
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ZardQuarterPickerComponent),
      multi: true,
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'class()',
  },
  exportAs: 'zQuarterPicker',
})
export class ZardQuarterPickerComponent implements ControlValueAccessor {
  private readonly datePipe = inject(DatePipe);
  private readonly i18n = injectUiI18nService();

  readonly calendarTemplate = viewChild.required<TemplateRef<unknown>>('calendarTemplate');
  readonly popoverDirective = viewChild.required<ZardPopoverDirective>('popoverDirective');

  readonly class = input<ClassValue>('');
  readonly zType = input<ZardButtonTypeVariants>('outline');
  readonly zSize = input<ZardDatePickerSizeVariants>('default');
  readonly value = model<Date | null>(null);
  readonly placeholder = input<string>('Pick a quarter');
  readonly zFormat = input<string>('quarter');
  readonly minDate = input<Date | null>(null);
  readonly maxDate = input<Date | null>(null);
  readonly disabled = model<boolean>(false);

  readonly dateChange = output<Date | null>();

  private onChange: (value: Date | null) => void = noopFn;
  private onTouched: () => void = noopFn;

  protected readonly chooseQuarterAriaLabel = computed(() =>
    this.i18n.t('datePicker.chooseQuarter', { Default: 'Choose quarter' }),
  );
  protected readonly displayText = computed(() => {
    const value = this.value();
    if (!value) {
      return this.placeholder();
    }

    if (this.zFormat() !== 'quarter') {
      return this.formatDate(value, this.zFormat());
    }

    const quarter = Math.floor(value.getMonth() / 3) + 1;
    return `${value.getFullYear()} ${this.i18n.t('datePicker.quarter', { Default: 'Q{{quarter}}', quarter })}`;
  });
  protected readonly activeYear = computed(() => this.openValue().getFullYear());
  protected readonly quarterItems = computed(() => {
    const year = this.activeYear();
    const selected = this.value();
    const minDate = this.minDate();
    const maxDate = this.maxDate();
    return Array.from({ length: 4 }, (_, index) => {
      const value = new Date(year, index * 3, 1, 12, 0, 0, 0);
      return {
        index,
        label: this.i18n.t('datePicker.quarter', { Default: 'Q{{quarter}}', quarter: index + 1 }),
        selected:
          !!selected && selected.getFullYear() === year && Math.floor(selected.getMonth() / 3) === index,
        disabled: !!(minDate && endOfQuarter(year, index) < minDate) || !!(maxDate && value > maxDate),
      };
    });
  });
  protected readonly buttonClasses = computed(() => {
    const hasValue = !!this.value();
    return mergeClasses(
      'justify-start text-left font-normal',
      !hasValue && 'text-muted-foreground',
      HEIGHT_BY_SIZE[this.zSize()],
      'w-full min-w-[240px]',
    );
  });
  protected readonly textClasses = computed(() => mergeClasses(!this.value() && 'text-muted-foreground'));
  protected readonly popoverClasses = computed(() => mergeClasses('w-auto p-0'));
  protected readonly openValue = model<Date>(new Date());

  protected onPopoverVisibilityChange(visible: boolean): void {
    if (visible) {
      this.openValue.set(startOfQuarter(this.value() ?? new Date()));
    }
  }

  protected formatDate(date: Date, format: string): string {
    return this.datePipe.transform(date, format, undefined, this.i18n.language()) ?? '';
  }

  protected shiftYear(offset: number): void {
    const current = this.openValue();
    this.openValue.set(new Date(current.getFullYear() + offset, current.getMonth(), 1, 12, 0, 0, 0));
  }

  protected selectQuarter(index: number): void {
    const value = new Date(this.activeYear(), index * 3, 1, 12, 0, 0, 0);
    this.value.set(value);
    this.onChange(value);
    this.onTouched();
    this.dateChange.emit(value);
    this.popoverDirective().hide();
  }

  writeValue(value: Date | null): void {
    this.value.set(value);
  }

  registerOnChange(fn: (value: Date | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }
}
