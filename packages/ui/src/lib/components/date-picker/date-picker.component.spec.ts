import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { provideUiI18nAdapter } from '@/src/lib/core/i18n/ui-i18n.service';
import { ZardDatePickerComponent } from './date-picker.component';
import { ZardMonthPickerComponent } from './month-picker.component';
import { ZardQuarterPickerComponent } from './quarter-picker.component';
import { ZardYearPickerComponent } from './year-picker.component';

function createI18nProvider(language: WritableSignal<string>) {
  return provideUiI18nAdapter({
    language,
    translate: (key, options) => {
      const locale = options?.lng ?? language();

      if (key === 'datePicker.quarter') {
        const quarter = String(options?.quarter ?? '');
        return locale.startsWith('zh') ? `Q${quarter}` : `Q${quarter}`;
      }

      const defaults = {
        'datePicker.chooseDate': locale.startsWith('zh') ? '选择日期' : 'Choose date',
        'datePicker.chooseMonth': locale.startsWith('zh') ? '选择月份' : 'Choose month',
        'datePicker.chooseQuarter': locale.startsWith('zh') ? '选择季度' : 'Choose quarter',
        'datePicker.chooseYear': locale.startsWith('zh') ? '选择年份' : 'Choose year',
      } as Record<string, string>;

      return defaults[key] ?? String(options?.defaultValue ?? options?.Default ?? key);
    },
  });
}

describe('ZardDatePicker family', () => {
  it('writes and emits values for the day picker', async () => {
    const language = signal('en-US');
    const fixture = await TestBed.configureTestingModule({
      imports: [ZardDatePickerComponent],
      providers: [createI18nProvider(language)],
    }).createComponent(ZardDatePickerComponent);

    const component = fixture.componentInstance;
    const onChange = jest.fn();
    const emitted: Array<Date | null> = [];

    component.registerOnChange(onChange);
    component.dateChange.subscribe((value) => emitted.push(value));
    component.writeValue(new Date(2026, 0, 5, 12, 0, 0, 0));

    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(button.textContent).toContain('2026');

    (component as any).onDateChange(new Date(2026, 0, 9, 12, 0, 0, 0));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect((onChange.mock.calls.at(-1)?.[0] as Date).getTime()).toBe(new Date(2026, 0, 9, 12, 0, 0, 0).getTime());
    expect(emitted[0]?.getTime()).toBe(new Date(2026, 0, 9, 12, 0, 0, 0).getTime());
  });

  it('localizes month labels and applies min/max boundaries', async () => {
    const language = signal('en-US');
    const fixture = await TestBed.configureTestingModule({
      imports: [ZardMonthPickerComponent],
      providers: [createI18nProvider(language)],
    }).createComponent(ZardMonthPickerComponent);

    const component = fixture.componentInstance;

    fixture.componentRef.setInput('minDate', new Date(2026, 2, 15, 12, 0, 0, 0));
    fixture.componentRef.setInput('maxDate', new Date(2026, 9, 1, 12, 0, 0, 0));
    fixture.detectChanges();

    (component as any).openValue.set(new Date(2026, 5, 1, 12, 0, 0, 0));
    fixture.detectChanges();

    let monthItems = (component as any).monthItems() as Array<{ label: string; disabled: boolean }>;

    expect(monthItems[0].label).toBe(new Intl.DateTimeFormat('en-US', { month: 'short' }).format(new Date(2026, 0, 1)));
    expect(monthItems[1].disabled).toBe(true);
    expect(monthItems[2].disabled).toBe(false);
    expect(monthItems[10].disabled).toBe(true);

    language.set('zh-CN');
    fixture.detectChanges();

    monthItems = (component as any).monthItems();
    expect(monthItems[0].label).toBe(new Intl.DateTimeFormat('zh-CN', { month: 'short' }).format(new Date(2026, 0, 1)));
  });

  it('anchors month selections to the first day of the selected month', async () => {
    const language = signal('en-US');
    const fixture = await TestBed.configureTestingModule({
      imports: [ZardMonthPickerComponent],
      providers: [createI18nProvider(language)],
    }).createComponent(ZardMonthPickerComponent);

    const component = fixture.componentInstance;
    const onChange = jest.fn();
    const emitted: Array<Date | null> = [];

    component.registerOnChange(onChange);
    component.dateChange.subscribe((value) => emitted.push(value));

    fixture.detectChanges();

    (component as any).openValue.set(new Date(2026, 0, 1, 12, 0, 0, 0));
    (component as any).selectMonth(3);

    const value = onChange.mock.calls.at(-1)?.[0] as Date;
    expect(value.getFullYear()).toBe(2026);
    expect(value.getMonth()).toBe(3);
    expect(value.getDate()).toBe(1);
    expect(emitted[0]?.getMonth()).toBe(3);
    expect(emitted[0]?.getDate()).toBe(1);
  });

  it('anchors quarter selections to the first month of the quarter', async () => {
    const language = signal('en-US');
    const fixture = await TestBed.configureTestingModule({
      imports: [ZardQuarterPickerComponent],
      providers: [createI18nProvider(language)],
    }).createComponent(ZardQuarterPickerComponent);

    const component = fixture.componentInstance;
    const onChange = jest.fn();
    const emitted: Array<Date | null> = [];

    component.registerOnChange(onChange);
    component.dateChange.subscribe((value) => emitted.push(value));

    fixture.detectChanges();

    (component as any).openValue.set(new Date(2026, 0, 1, 12, 0, 0, 0));
    (component as any).selectQuarter(2);

    const value = onChange.mock.calls.at(-1)?.[0] as Date;
    expect(value.getFullYear()).toBe(2026);
    expect(value.getMonth()).toBe(6);
    expect(value.getDate()).toBe(1);
    expect(emitted[0]?.getMonth()).toBe(6);
    expect((component as any).quarterItems()[2].label).toBe('Q3');
  });

  it('anchors year selections to January 1 of the selected year', async () => {
    const language = signal('en-US');
    const fixture = await TestBed.configureTestingModule({
      imports: [ZardYearPickerComponent],
      providers: [createI18nProvider(language)],
    }).createComponent(ZardYearPickerComponent);

    const component = fixture.componentInstance;
    const onChange = jest.fn();
    const emitted: Array<Date | null> = [];

    component.registerOnChange(onChange);
    component.dateChange.subscribe((value) => emitted.push(value));

    fixture.detectChanges();

    (component as any).pageStart.set(2028);
    (component as any).selectYear(2031);

    const value = onChange.mock.calls.at(-1)?.[0] as Date;
    expect(value.getFullYear()).toBe(2031);
    expect(value.getMonth()).toBe(0);
    expect(value.getDate()).toBe(1);
    expect(emitted[0]?.getFullYear()).toBe(2031);
    expect((component as any).yearItems()[3].selected).toBe(true);
  });
});
