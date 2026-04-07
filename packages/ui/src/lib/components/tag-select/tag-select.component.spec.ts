import { OverlayContainer } from '@angular/cdk/overlay';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

import { ZardTagSelectComponent } from './tag-select.component';

interface UserOption {
  id: string;
  name: string;
}

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, ZardTagSelectComponent],
  template: `
    <z-tag-select
      [formControl]="control"
      mode="tags"
      [allowCreate]="true"
      [enableSuggestions]="enableSuggestions"
      [options]="options"
      [tokenSeparators]="[',', ';']"
      placeholder="Add tag"
    />
  `,
})
class TagStringHostComponent {
  readonly control = new FormControl<string[]>([], { nonNullable: true });
  enableSuggestions = true;
  autoFocus = false;
  readonly options = [
    { value: 'alpha-id', label: 'Alpha' },
    { value: 'Beta', label: 'Beta' },
  ];
}

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, ZardTagSelectComponent],
  template: `
    <z-tag-select
      [formControl]="control"
      mode="tags"
      [allowCreate]="true"
      [autoFocus]="true"
      placeholder="Add tag"
    />
  `,
})
class AutoFocusHostComponent {
  readonly control = new FormControl<string[]>([], { nonNullable: true });
}

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, ZardTagSelectComponent],
  template: `
    <z-tag-select
      [formControl]="control"
      mode="multiple"
      [enableSuggestions]="true"
      [options]="options"
      [compareWith]="compareWith"
      placeholder="Select users"
    />
  `,
})
class MultipleObjectHostComponent {
  readonly control = new FormControl<UserOption[]>([{ id: '1', name: 'Alice' }], { nonNullable: true });
  readonly options = [
    { value: { id: '1', name: 'Alice' }, label: 'Alice' },
    { value: { id: '2', name: 'Bob' }, label: 'Bob' },
  ];

  readonly compareWith = (a: UserOption, b: UserOption) => a.id === b.id;
}

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, ZardTagSelectComponent],
  template: `
    <z-tag-select
      [formControl]="control"
      mode="tags"
      [allowCreate]="true"
      [enableSuggestions]="true"
      [options]="options"
      [compareWith]="compareWith"
      [displayWith]="displayWith"
      [createValueFromInput]="createValueFromInput"
      placeholder="Add tag"
    />
  `,
})
class ObjectTagHostComponent {
  readonly control = new FormControl<Array<{ id?: string; name: string }>>([], { nonNullable: true });
  readonly options = [{ value: { id: '1', name: 'Alpha' }, label: 'Alpha' }];
  readonly compareWith = (a: { id?: string; name: string }, b: { id?: string; name: string }) =>
    (a.id && b.id ? a.id === b.id : a.name.trim().toLowerCase() === b.name.trim().toLowerCase());
  readonly displayWith = (value: { id?: string; name: string } | null | undefined) => value?.name ?? '';
  readonly createValueFromInput = (text: string) => ({ name: text });
}

function setInputValue(input: HTMLInputElement, value: string) {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function dispatchPaste(input: HTMLInputElement, text: string) {
  const event = new Event('paste', { bubbles: true, cancelable: true }) as Event & {
    clipboardData?: { getData: (type: string) => string };
  };

  Object.defineProperty(event, 'clipboardData', {
    value: {
      getData: (_type: string) => text,
    },
  });

  input.dispatchEvent(event);
}

describe('ZardTagSelectComponent', () => {
  it('does not auto focus by default and focuses the input when the container is clicked', async () => {
    const fixture = TestBed.configureTestingModule({
      imports: [TagStringHostComponent],
    }).createComponent(TagStringHostComponent);

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    expect(document.activeElement).not.toBe(input);

    const container = fixture.nativeElement.querySelector('z-tag-select-input-trigger > div') as HTMLElement;
    container.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    fixture.detectChanges();

    expect(document.activeElement).toBe(input);
  });

  it('auto focuses the inline input only when autoFocus is enabled', async () => {
    const fixture = TestBed.configureTestingModule({
      imports: [AutoFocusHostComponent],
    }).createComponent(AutoFocusHostComponent);

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    expect(document.activeElement).toBe(input);
  });

  it('trims created tokens, ignores case for duplicate strings, and removes the last token on Backspace', async () => {
    const fixture = TestBed.configureTestingModule({
      imports: [TagStringHostComponent],
    }).createComponent(TagStringHostComponent);

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;

    setInputValue(input, '  Gamma  ');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();

    expect(fixture.componentInstance.control.value).toEqual(['Gamma']);

    setInputValue(input, ' gamma ');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();

    expect(fixture.componentInstance.control.value).toEqual(['Gamma']);

    setInputValue(input, '');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
    fixture.detectChanges();

    expect(fixture.componentInstance.control.value).toEqual([]);
  });

  it('tokenizes separator input and pasted values', async () => {
    const fixture = TestBed.configureTestingModule({
      imports: [TagStringHostComponent],
    }).createComponent(TagStringHostComponent);

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;

    setInputValue(input, 'One,Two;Three');
    fixture.detectChanges();
    expect(fixture.componentInstance.control.value).toEqual(['One', 'Two']);
    expect(input.value).toBe('Three');

    dispatchPaste(input, 'Four,Five');
    fixture.detectChanges();

    expect(fixture.componentInstance.control.value).toEqual(['One', 'Two', 'Four', 'Five']);
  });

  it('prefers an existing option over creating a new token when the label exactly matches', async () => {
    const fixture = TestBed.configureTestingModule({
      imports: [TagStringHostComponent],
    }).createComponent(TagStringHostComponent);
    const overlayContainer = TestBed.inject(OverlayContainer);

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.focus();
    fixture.detectChanges();

    setInputValue(input, ' alpha ');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(overlayContainer.getContainerElement().textContent).toContain('Alpha');

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();

    expect(fixture.componentInstance.control.value).toEqual(['alpha-id']);
  });

  it('does not mount suggestions when they are disabled', async () => {
    const fixture = TestBed.configureTestingModule({
      imports: [TagStringHostComponent],
    }).createComponent(TagStringHostComponent);
    const overlayContainer = TestBed.inject(OverlayContainer);

    fixture.componentInstance.enableSuggestions = false;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    setInputValue(input, 'Alpha');
    fixture.detectChanges();

    expect(overlayContainer.getContainerElement().textContent?.trim()).toBe('');
  });

  it('shows the dropdown indicator only when suggestions are enabled', async () => {
    const fixture = TestBed.configureTestingModule({
      imports: [TagStringHostComponent],
    }).createComponent(TagStringHostComponent);

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-slot="tag-select-suggestions-indicator"]'),
    ).not.toBeNull();

    fixture.componentInstance.enableSuggestions = false;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-slot="tag-select-suggestions-indicator"]'),
    ).toBeNull();
  });

  it('uses compareWith for object values and avoids duplicate selection', async () => {
    const fixture = TestBed.configureTestingModule({
      imports: [MultipleObjectHostComponent],
    }).createComponent(MultipleObjectHostComponent);
    const overlayContainer = TestBed.inject(OverlayContainer);

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const hostText = fixture.nativeElement.textContent as string;
    expect(hostText).toContain('Alice');

    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.focus();
    fixture.detectChanges();
    await fixture.whenStable();

    const overlayText = overlayContainer.getContainerElement().textContent as string;
    expect(overlayText).not.toContain('Alice');
    expect(overlayText).toContain('Bob');
  });

  it('creates object values from input when createValueFromInput is provided', async () => {
    const fixture = TestBed.configureTestingModule({
      imports: [ObjectTagHostComponent],
    }).createComponent(ObjectTagHostComponent);

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    setInputValue(input, 'Gamma');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();

    expect(fixture.componentInstance.control.value).toEqual([{ name: 'Gamma' }]);
  });
});
