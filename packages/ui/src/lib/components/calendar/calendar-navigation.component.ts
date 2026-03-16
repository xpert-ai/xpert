import { ChangeDetectionStrategy, Component, computed, input, output, ViewEncapsulation } from '@angular/core';

import { getMonthNames } from '@/src/lib/components/calendar/calendar.utils';
import { injectUiI18nService } from '@/src/lib/core/i18n/ui-i18n.service';
import { mergeClasses } from '@/shared/utils/merge-classes';

import { calendarNavVariants } from './calendar.variants';
import { ZardButtonComponent } from '@/src/lib/components/button/button.component';
import { ZardIconComponent } from '@/src/lib/components/icon/icon.component';
import { ZardSelectItemComponent } from '@/src/lib/components/select/select-item.component';
import { ZardSelectComponent, type ZardSelectValue } from '@/src/lib/components/select/select.component';

@Component({
  selector: 'z-calendar-navigation',
  imports: [ZardButtonComponent, ZardIconComponent, ZardSelectComponent, ZardSelectItemComponent],
  template: `
    <div [class]="navClasses()">
      <button
        type="button"
        z-button
        zType="ghost"
        zSize="sm"
        (click)="onPreviousClick()"
        [disabled]="isPreviousDisabled()"
        [attr.aria-label]="previousMonthLabel()"
        class="size-7 p-0"
      >
        <z-icon zType="chevron-left" />
      </button>

      <!-- Month and Year Selectors -->
      <div class="flex items-center space-x-2">
        <!-- Month Select -->
        <z-select [zValue]="currentMonth()" [zLabel]="currentMonthName()" (zSelectionChange)="onMonthChange($event)">
          @for (month of months(); track month) {
            <z-select-item [zValue]="$index.toString()">{{ month }}</z-select-item>
          }
        </z-select>

        <!-- Year Select -->
        <z-select [zValue]="currentYear()" [zLabel]="currentYear()" (zSelectionChange)="onYearChange($event)">
          @for (year of availableYears(); track year) {
            <z-select-item [zValue]="year.toString()">{{ year }}</z-select-item>
          }
        </z-select>
      </div>

      <button
        type="button"
        z-button
        zType="ghost"
        zSize="sm"
        (click)="onNextClick()"
        [disabled]="isNextDisabled()"
        [attr.aria-label]="nextMonthLabel()"
        class="size-7 p-0"
      >
        <z-icon zType="chevron-right" />
      </button>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  exportAs: 'zCalendarNavigation',
})
export class ZardCalendarNavigationComponent {
  private readonly i18n = injectUiI18nService();

  // Inputs
  readonly currentMonth = input.required<string>();
  readonly currentYear = input.required<string>();
  readonly minDate = input<Date | null>(null);
  readonly maxDate = input<Date | null>(null);
  readonly disabled = input<boolean>(false);

  // Outputs
  readonly monthChange = output<string>();
  readonly yearChange = output<string>();
  readonly previousMonth = output<void>();
  readonly nextMonth = output<void>();
  protected readonly months = computed(() => getMonthNames(this.i18n.language(), 'short'));
  protected readonly previousMonthLabel = computed(() =>
    this.i18n.t('datePicker.previousMonth', { Default: 'Previous month' }),
  );
  protected readonly nextMonthLabel = computed(() =>
    this.i18n.t('datePicker.nextMonth', { Default: 'Next month' }),
  );

  protected readonly navClasses = computed(() => mergeClasses(calendarNavVariants()));

  protected readonly availableYears = computed(() => {
    const minYear = this.minDate()?.getFullYear() ?? new Date().getFullYear() - 10;
    const maxYear = this.maxDate()?.getFullYear() ?? new Date().getFullYear() + 10;
    const years = [];
    for (let i = minYear; i <= maxYear; i++) {
      years.push(i);
    }
    return years;
  });

  protected readonly currentMonthName = computed(() => {
    const selectedMonth = Number.parseInt(this.currentMonth());
    const months = this.months();
    if (!Number.isNaN(selectedMonth) && months[selectedMonth]) {
      return months[selectedMonth];
    }
    return months[new Date().getMonth()];
  });

  protected readonly isPreviousDisabled = computed(() => {
    if (this.disabled()) {
      return true;
    }

    const minDate = this.minDate();
    if (!minDate) {
      return false;
    }

    const currentMonth = Number.parseInt(this.currentMonth());
    const currentYear = Number.parseInt(this.currentYear());
    const lastDayOfPreviousMonth = new Date(currentYear, currentMonth, 0);

    return lastDayOfPreviousMonth.getTime() < minDate.getTime();
  });

  protected readonly isNextDisabled = computed(() => {
    if (this.disabled()) {
      return true;
    }

    const maxDate = this.maxDate();
    if (!maxDate) {
      return false;
    }

    const currentMonth = Number.parseInt(this.currentMonth());
    const currentYear = Number.parseInt(this.currentYear());
    const nextMonth = new Date(currentYear, currentMonth + 1, 1);

    return nextMonth.getTime() > maxDate.getTime();
  });

  protected onPreviousClick(): void {
    this.previousMonth.emit();
  }

  protected onNextClick(): void {
    this.nextMonth.emit();
  }

  protected onMonthChange(month: ZardSelectValue | ZardSelectValue[]): void {
    if (Array.isArray(month)) {
      console.warn('Calendar navigation received array for month selection, expected single value. Ignoring:', month);
      return;
    }
    this.monthChange.emit(month.toString());
  }

  protected onYearChange(year: ZardSelectValue | ZardSelectValue[]): void {
    if (Array.isArray(year)) {
      console.warn('Calendar navigation received array for year selection, expected single value. Ignoring:', year);
      return;
    }
    this.yearChange.emit(year.toString());
  }
}
