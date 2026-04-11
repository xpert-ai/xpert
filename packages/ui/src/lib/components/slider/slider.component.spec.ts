import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

import { ZardSliderComponent, type ZardSliderValue } from './slider.component';

@Component({
  imports: [ReactiveFormsModule, ZardSliderComponent],
  template: `
    <z-slider
      [formControl]="control"
      [showTickMarks]="true"
      [showValueLabel]="true"
      [formatValue]="formatValue"
      (valueChange)="onValueChange($event)"
      (changeEnd)="onChangeEnd($event)"
    />
  `,
})
class ReactiveHostComponent {
  readonly control = new FormControl<number | null>(50);
  readonly valueChanges: ZardSliderValue[] = [];
  readonly changeEnds: ZardSliderValue[] = [];

  readonly formatValue = (value: number) => `v:${value}`;

  onValueChange(value: ZardSliderValue) {
    this.valueChanges.push(value);
  }

  onChangeEnd(value: ZardSliderValue) {
    this.changeEnds.push(value);
  }
}

@Component({
  imports: [ZardSliderComponent],
  template: `
    <z-slider
      mode="range"
      [min]="0"
      [max]="100"
      [step]="10"
      [showValueLabel]="true"
      [value]="range"
      (valueChange)="onRangeChange($event)"
      (changeEnd)="onRangeEnd($event)"
    />
  `,
})
class RangeHostComponent {
  range: readonly [number, number] = [20, 40];
  readonly valueChanges: Array<readonly [number, number]> = [];
  readonly changeEnds: Array<readonly [number, number]> = [];

  onRangeChange(value: ZardSliderValue) {
    this.range = value as readonly [number, number];
    this.valueChanges.push(this.range);
  }

  onRangeEnd(value: ZardSliderValue) {
    this.changeEnds.push(value as readonly [number, number]);
  }
}

@Component({
  imports: [ZardSliderComponent],
  template: `
    <z-slider [min]="0" [max]="1" [step]="0.1" [showValueLabel]="true" [value]="0.30000000000000004" />
  `,
})
class FloatHostComponent {}

function mockTrackRect(track: HTMLElement, width = 100, height = 10) {
  jest.spyOn(track, 'getBoundingClientRect').mockReturnValue({
    width,
    height,
    left: 0,
    top: 0,
    right: width,
    bottom: height,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
}

function dispatchPointerEvent(target: EventTarget, type: string, clientX: number, clientY: number) {
  const event = new MouseEvent(type, { bubbles: true, clientX, clientY });
  Object.defineProperty(event, 'clientX', { value: clientX });
  Object.defineProperty(event, 'clientY', { value: clientY });
  target.dispatchEvent(event);
}

function dispatchMouseEvent(target: EventTarget, type: string, clientX: number, clientY: number) {
  const event = new MouseEvent(type, { bubbles: true, clientX, clientY });
  Object.defineProperty(event, 'clientX', { value: clientX });
  Object.defineProperty(event, 'clientY', { value: clientY });
  target.dispatchEvent(event);
}

describe('ZardSliderComponent', () => {
  it('emits continuous valueChange and a single changeEnd while dragging', async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [ReactiveHostComponent],
    }).createComponent(ReactiveHostComponent);

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement.querySelector('z-slider') as HTMLElement;
    const track = fixture.nativeElement.querySelector('[data-slot="slider-track"]') as HTMLElement;
    mockTrackRect(track);

    dispatchPointerEvent(host, 'pointerdown', 10, 5);
    dispatchPointerEvent(document, 'pointermove', 30, 5);
    dispatchPointerEvent(document, 'pointermove', 60, 5);
    dispatchPointerEvent(document, 'pointerup', 60, 5);

    fixture.detectChanges();

    expect(fixture.componentInstance.valueChanges.length).toBeGreaterThan(1);
    expect(fixture.componentInstance.valueChanges.at(-1)).toBe(60);
    expect(fixture.componentInstance.changeEnds).toEqual([60]);
    expect(fixture.componentInstance.control.value).toBe(60);
    expect(fixture.nativeElement.querySelectorAll('[data-slot="slider-tick"]').length).toBe(51);
  });

  it('supports mouse dragging as a fallback interaction path', async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [ReactiveHostComponent],
    }).createComponent(ReactiveHostComponent);

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement.querySelector('z-slider') as HTMLElement;
    const track = fixture.nativeElement.querySelector('[data-slot="slider-track"]') as HTMLElement;
    mockTrackRect(track);

    dispatchMouseEvent(host, 'mousedown', 10, 5);
    dispatchMouseEvent(document, 'mousemove', 40, 5);
    dispatchMouseEvent(document, 'mousemove', 70, 5);
    dispatchMouseEvent(document, 'mouseup', 70, 5);

    fixture.detectChanges();

    expect(fixture.componentInstance.valueChanges.at(-1)).toBe(70);
    expect(fixture.componentInstance.changeEnds.at(-1)).toBe(70);
    expect(fixture.componentInstance.control.value).toBe(70);
  });

  it('renders the track as a block element so width and height utilities apply', async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [ReactiveHostComponent],
    }).createComponent(ReactiveHostComponent);

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const track = fixture.nativeElement.querySelector('[data-slot="slider-track"]') as HTMLElement;
    expect(track.className).toContain('block');
    expect(track.className).toContain('bg-border');
  });

  it('shows formatted value labels on focus', async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [ReactiveHostComponent],
    }).createComponent(ReactiveHostComponent);

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const thumb = fixture.nativeElement.querySelector('[data-slot="slider-thumb"]') as HTMLElement;
    thumb.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    fixture.detectChanges();

    const label = fixture.nativeElement.querySelector('[data-slot="slider-thumb"] span') as HTMLElement;
    expect(label.textContent?.trim()).toBe('v:50');
    expect(thumb.getAttribute('aria-valuetext')).toBe('v:50');
  });

  it('formats floating point values without binary precision artifacts', async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [FloatHostComponent],
    }).createComponent(FloatHostComponent);

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const thumb = fixture.nativeElement.querySelector('[data-slot="slider-thumb"]') as HTMLElement;
    thumb.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    fixture.detectChanges();

    expect(thumb.getAttribute('aria-valuetext')).toBe('0.3');
    expect(fixture.nativeElement.textContent).not.toContain('0.30000000000000004');
  });

  it('renders a non-zero active range for single sliders', async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [ReactiveHostComponent],
    }).createComponent(ReactiveHostComponent);

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const range = fixture.nativeElement.querySelector('[data-slot="slider-range"]') as HTMLElement;

    expect(range.style.left).toBe('0%');
    expect(range.style.right).toBe('50%');
  });

  it('renders the thumb visual on the positioned host without an extra absolute offset', async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [ReactiveHostComponent],
    }).createComponent(ReactiveHostComponent);

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const thumb = fixture.nativeElement.querySelector('[data-slot="slider-thumb"]') as HTMLElement;

    expect(thumb.className).not.toContain('absolute');
  });

  it('supports range mode and prevents thumbs from crossing on keyboard updates', async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [RangeHostComponent],
    }).createComponent(RangeHostComponent);

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const thumbs = fixture.nativeElement.querySelectorAll('[data-slot="slider-thumb"]');
    const firstThumb = thumbs[0] as HTMLElement;

    firstThumb.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    fixture.detectChanges();

    firstThumb.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'End' }));
    fixture.detectChanges();

    expect(fixture.componentInstance.range).toEqual([40, 40]);
    expect(fixture.componentInstance.changeEnds.at(-1)).toEqual([40, 40]);
    expect(fixture.nativeElement.querySelectorAll('[data-slot="slider-thumb"]').length).toBe(2);
  });
});
