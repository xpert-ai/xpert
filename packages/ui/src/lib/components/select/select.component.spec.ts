import { OverlayContainer } from '@angular/cdk/overlay';
import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

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
});
