import { OverlayContainer } from '@angular/cdk/overlay';
import { CommonModule } from '@angular/common';
import { Component, signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

import { provideUiI18nAdapter } from '@/src/lib/core/i18n/ui-i18n.service';
import { ZardSelectItemComponent } from './select-item.component';
import { ZardSelectComponent } from './select.component';

function dispatchPointerDown(element: Element) {
  if (typeof PointerEvent !== 'function') {
    return;
  }

  element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
}

function dispatchMouseDown(element: Element) {
  const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true, composed: true });
  element.dispatchEvent(event);
  return event;
}

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, ZardSelectComponent, ZardSelectItemComponent],
  template: `
    <z-select [formControl]="control" zPlaceholder="Select a role">
      <z-select-item zValue="SUPER_ADMIN">SUPER_ADMIN</z-select-item>
      <z-select-item zValue="ADMIN">ADMIN</z-select-item>
      <z-select-item zValue="VIEWER">VIEWER</z-select-item>
    </z-select>
  `,
})
class TestHostComponent {
  readonly control = new FormControl<string | null>(null);
}

@Component({
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ZardSelectComponent, ZardSelectItemComponent],
  template: `
    <z-select [formControl]="control" zPlaceholder="Select a role">
      @for (option of options; track option.value) {
        <z-select-item [zValue]="option.value">{{ option.label }}</z-select-item>
      }
    </z-select>
  `,
})
class AsyncOptionsHostComponent {
  readonly control = new FormControl<string | null>(null);
  options: Array<{ value: string; label: string }> = [];
}

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, ZardSelectComponent, ZardSelectItemComponent],
  template: `
    <z-select [formControl]="control" [zMultiple]="true" [zMaxLabelCount]="1" zPlaceholder="Select roles">
      <z-select-item zValue="SUPER_ADMIN">SUPER_ADMIN</z-select-item>
      <z-select-item zValue="ADMIN">ADMIN</z-select-item>
      <z-select-item zValue="VIEWER">VIEWER</z-select-item>
    </z-select>
  `,
})
class MultiSelectHostComponent {
  readonly control = new FormControl<Array<string>>(['SUPER_ADMIN', 'ADMIN'], { nonNullable: true });
}

function createI18nProvider(language: WritableSignal<string>) {
  return provideUiI18nAdapter({
    language,
    translate: (key, options) => {
      const count = Number(options?.count ?? 0);
      const locale = options?.lng ?? language();

      if (key === 'xp-ui:select.moreItemsSelected') {
        if (locale.startsWith('zh')) {
          return `还有 ${count} 项已选择`;
        }

        return `${count} more item${count === 1 ? '' : 's'} selected`;
      }

      return String(options?.defaultValue ?? options?.Default ?? key);
    },
  });
}

describe('ZardSelectComponent', () => {
  it('selects an option from the overlay after pointer and mouse down events', async () => {
    const fixture = TestBed.configureTestingModule({
      imports: [TestHostComponent],
    }).createComponent(TestHostComponent);
    const overlayContainer = TestBed.inject(OverlayContainer);

    fixture.detectChanges();

    const trigger = fixture.nativeElement.querySelector('z-select button[role="combobox"]') as HTMLButtonElement;
    trigger.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const options = overlayContainer.getContainerElement().querySelectorAll('z-select-item');
    const adminOption = options[1] as HTMLElement;

    dispatchPointerDown(adminOption);
    const mouseDownEvent = dispatchMouseDown(adminOption);
    adminOption.click();

    fixture.detectChanges();
    await fixture.whenStable();

    expect(mouseDownEvent.defaultPrevented).toBe(true);
    expect(fixture.componentInstance.control.value).toBe('ADMIN');
    expect(trigger.textContent).toContain('ADMIN');
  });

  it('selects an option when items are rendered after initialization', async () => {
    const fixture = TestBed.configureTestingModule({
      imports: [AsyncOptionsHostComponent],
    }).createComponent(AsyncOptionsHostComponent);
    const overlayContainer = TestBed.inject(OverlayContainer);

    fixture.detectChanges();

    fixture.componentInstance.options = [
      { value: 'SUPER_ADMIN', label: 'SUPER_ADMIN' },
      { value: 'ADMIN', label: 'ADMIN' },
      { value: 'VIEWER', label: 'VIEWER' },
    ];
    fixture.detectChanges();
    await fixture.whenStable();

    const trigger = fixture.nativeElement.querySelector('z-select button[role="combobox"]') as HTMLButtonElement;
    trigger.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const options = overlayContainer.getContainerElement().querySelectorAll('z-select-item');
    const adminOption = options[1] as HTMLElement;

    dispatchPointerDown(adminOption);
    const mouseDownEvent = dispatchMouseDown(adminOption);
    adminOption.click();

    fixture.detectChanges();
    await fixture.whenStable();

    expect(mouseDownEvent.defaultPrevented).toBe(true);
    expect(fixture.componentInstance.control.value).toBe('ADMIN');
    expect(trigger.textContent).toContain('ADMIN');
  });

  it('localizes the multiselect overflow summary', async () => {
    const language = signal('en-US');
    const fixture = TestBed.configureTestingModule({
      imports: [MultiSelectHostComponent],
      providers: [createI18nProvider(language)],
    }).createComponent(MultiSelectHostComponent);

    fixture.detectChanges();
    await fixture.whenStable();

    let trigger = fixture.nativeElement.querySelector('z-select button[role="combobox"]') as HTMLButtonElement;
    expect(trigger.textContent).toContain('SUPER_ADMIN');
    expect(trigger.textContent).toContain('1 more item selected');

    language.set('zh-Hans');
    fixture.detectChanges();
    await fixture.whenStable();

    trigger = fixture.nativeElement.querySelector('z-select button[role="combobox"]') as HTMLButtonElement;
    expect(trigger.textContent).toContain('还有 1 项已选择');
  });
});
