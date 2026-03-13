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
  signal,
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
import { endOfYear, HEIGHT_BY_SIZE, startOfYear } from './picker.utils';

function getPageStart(year: number): number {
  return year - (year % 12);
}

@Component({
  selector: 'z-year-picker, [z-year-picker]',
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
      [attr.aria-label]="chooseYearAriaLabel()"
    >
      <z-icon zType="calendar" />
      <span [class]="textClasses()">{{ displayText() }}</span>
    </button>

    <ng-template #calendarTemplate>
      <z-popover [class]="popoverClasses()">
        <div class="w-[280px] rounded-lg border bg-popover p-3 text-popover-foreground shadow-md">
          <div class="mb-3 flex items-center justify-between gap-2">
            <button z-button zType="ghost" zSize="sm" type="button" class="size-8 p-0" (click)="shiftPage(-12)" [disabled]="disabled()">
              <z-icon zType="chevron-left" />
            </button>
            <div class="text-sm font-semibold">{{ pageStart() }} - {{ pageStart() + 11 }}</div>
            <button z-button zType="ghost" zSize="sm" type="button" class="size-8 p-0" (click)="shiftPage(12)" [disabled]="disabled()">
              <z-icon zType="chevron-right" />
            </button>
          </div>

          <div class="grid grid-cols-3 gap-2">
            @for (year of yearItems(); track year.value) {
              <button
                z-button
                type="button"
                zSize="sm"
                [zType]="year.selected ? 'default' : 'ghost'"
                class="justify-center"
                [disabled]="year.disabled"
                (click)="selectYear(year.value)"
              >
                {{ year.value }}
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
      useExisting: forwardRef(() => ZardYearPickerComponent),
      multi: true,
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'class()',
  },
  exportAs: 'zYearPicker',
})
export class ZardYearPickerComponent implements ControlValueAccessor {
  private readonly datePipe = inject(DatePipe);
  private readonly i18n = injectUiI18nService();

  readonly calendarTemplate = viewChild.required<TemplateRef<unknown>>('calendarTemplate');
  readonly popoverDirective = viewChild.required<ZardPopoverDirective>('popoverDirective');

  readonly class = input<ClassValue>('');
  readonly zType = input<ZardButtonTypeVariants>('outline');
  readonly zSize = input<ZardDatePickerSizeVariants>('default');
  readonly value = model<Date | null>(null);
  readonly placeholder = input<string>('Pick a year');
  readonly zFormat = input<string>('yyyy');
  readonly minDate = input<Date | null>(null);
  readonly maxDate = input<Date | null>(null);
  readonly disabled = model<boolean>(false);

  readonly dateChange = output<Date | null>();

  private onChange: (value: Date | null) => void = noopFn;
  private onTouched: () => void = noopFn;

  protected readonly chooseYearAriaLabel = computed(() =>
    this.i18n.t('datePicker.chooseYear', { Default: 'Choose year' }),
  );
  protected readonly displayText = computed(() => {
    const value = this.value();
    if (!value) {
      return this.placeholder();
    }

    const format = this.zFormat();
    return this.formatDate(value, format === 'MMMM d, yyyy' ? 'yyyy' : format);
  });
  protected readonly pageStart = signal(getPageStart(new Date().getFullYear()));
  protected readonly yearItems = computed(() => {
    const minDate = this.minDate();
    const maxDate = this.maxDate();
    const selectedYear = this.value()?.getFullYear();
    return Array.from({ length: 12 }, (_, index) => {
      const value = this.pageStart() + index;
      return {
        value,
        selected: selectedYear === value,
        disabled:
          !!(minDate && endOfYear(value) < minDate) ||
          !!(maxDate && new Date(value, 0, 1, 12, 0, 0, 0) > maxDate),
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

  protected onPopoverVisibilityChange(visible: boolean): void {
    if (visible) {
      const value = startOfYear(this.value() ?? new Date());
      this.pageStart.set(getPageStart(value.getFullYear()));
    }
  }

  protected formatDate(date: Date, format: string): string {
    return this.datePipe.transform(date, format, undefined, this.i18n.language()) ?? '';
  }

  protected shiftPage(offset: number): void {
    this.pageStart.update((value) => value + offset);
  }

  protected selectYear(year: number): void {
    const value = new Date(year, 0, 1, 12, 0, 0, 0);
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
