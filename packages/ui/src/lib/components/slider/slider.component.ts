import { DOCUMENT } from '@angular/common';
import {
  type AfterViewInit,
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  forwardRef,
  inject,
  input,
  linkedSignal,
  numberAttribute,
  type OnChanges,
  type OnDestroy,
  output,
  signal,
  type SimpleChanges,
  viewChild,
  viewChildren,
  ViewEncapsulation,
} from '@angular/core';
import { type ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

import type { ClassValue } from 'clsx';
import { filter, fromEvent, merge, Subject, switchMap, takeUntil, tap } from 'rxjs';

import { mergeClasses } from '@/shared/utils/merge-classes';
import { clamp, convertValueToPercentage, roundToStep } from '@/shared/utils/number';

import {
  sliderLabelVariants,
  sliderOrientationVariants,
  sliderRangeVariants,
  sliderThumbVariants,
  sliderTickVariants,
  sliderTrackVariants,
  sliderVariants,
} from './slider.variants';

export type ZardSliderMode = 'single' | 'range';
export type ZardSliderValue = number | readonly [number, number];

type SliderTuple = readonly [number, number];
type SliderTick = {
  key: string;
  percent: number;
};
type OnTouchedType = () => void;
type OnChangeType = (value: ZardSliderValue) => void;

@Component({
  selector: 'z-slider-track',
  standalone: true,
  template: `
    <span #track data-slot="slider-track" [attr.data-orientation]="orientation()" [class]="classes()">
      <ng-content />
    </span>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': '"data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full"',
    '[attr.data-orientation]': 'orientation()',
  },
})
export class ZSliderTrackComponent {
  readonly orientation = input<'horizontal' | 'vertical'>('horizontal');
  readonly class = input<ClassValue>('');

  protected readonly classes = computed(() =>
    mergeClasses(sliderTrackVariants({ zOrientation: this.orientation() }), this.class()),
  );

  private readonly trackEl = viewChild.required<ElementRef<HTMLElement>>('track');

  get nativeElement(): HTMLElement {
    return this.trackEl().nativeElement;
  }
}

@Component({
  selector: 'z-slider-range',
  standalone: true,
  template: `
    <span
      data-slot="slider-range"
      [attr.data-orientation]="orientation()"
      [class]="classes()"
      [style.left]="orientation() === 'horizontal' ? startPercent() + '%' : null"
      [style.right]="orientation() === 'horizontal' ? 100 - endPercent() + '%' : null"
      [style.bottom]="orientation() === 'vertical' ? startPercent() + '%' : null"
      [style.top]="orientation() === 'vertical' ? 100 - endPercent() + '%' : null"
    ></span>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class ZSliderRangeComponent {
  readonly startPercent = input(0);
  readonly endPercent = input(0);
  readonly orientation = input<'horizontal' | 'vertical'>('horizontal');
  readonly class = input<ClassValue>('');

  protected readonly classes = computed(() =>
    mergeClasses(sliderRangeVariants({ zOrientation: this.orientation() }), this.class()),
  );
}

@Component({
  selector: 'z-slider-thumb',
  standalone: true,
  template: `
    <span
      #thumb
      data-slot="slider-thumb"
      [attr.data-active]="active() ? true : null"
      [attr.data-index]="index()"
      [attr.role]="'slider'"
      [attr.aria-valuemin]="min()"
      [attr.aria-valuemax]="max()"
      [attr.aria-valuenow]="value()"
      [attr.aria-valuetext]="ariaValueText()"
      [attr.aria-disabled]="disabled() ? true : null"
      [attr.aria-orientation]="orientation()"
      [attr.tabindex]="disabled() ? -1 : 0"
      [class]="classes()"
    >
      @if (showLabel()) {
        <span [class]="labelClasses()">{{ label() }}</span>
      }
    </span>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'orientationClasses()',
    '[style.left]': 'orientation() === "horizontal" ? percent() + "%" : null',
    '[style.bottom]': 'orientation() === "vertical" ? percent() + "%" : null',
  },
})
export class ZSliderThumbComponent {
  readonly index = input(0);
  readonly value = input(0);
  readonly min = input(0);
  readonly max = input(100);
  readonly disabled = input(false);
  readonly percent = input(0);
  readonly active = input(false);
  readonly showLabel = input(false);
  readonly label = input('');
  readonly orientation = input<'horizontal' | 'vertical'>('horizontal');
  readonly class = input<ClassValue>('');

  protected readonly classes = computed(() =>
    mergeClasses(sliderThumbVariants({ disabled: this.disabled(), active: this.active() }), this.class()),
  );

  protected readonly labelClasses = computed(() =>
    mergeClasses(sliderLabelVariants({ zOrientation: this.orientation() })),
  );

  protected readonly orientationClasses = computed(() =>
    mergeClasses(sliderOrientationVariants({ zOrientation: this.orientation() })),
  );

  protected readonly ariaValueText = computed(() => this.label() || `${this.value()}`);

  private readonly thumbEl = viewChild.required<ElementRef<HTMLElement>>('thumb');

  get nativeElement(): HTMLElement {
    return this.thumbEl().nativeElement;
  }
}

@Component({
  selector: 'z-slider',
  imports: [ZSliderTrackComponent, ZSliderRangeComponent, ZSliderThumbComponent],
  standalone: true,
  template: `
    <span
      data-slot="slider"
      [attr.data-orientation]="orientation()"
      class="flex data-[orientation=horizontal]:w-full data-[orientation=horizontal]:items-center data-[orientation=vertical]:h-full data-[orientation=vertical]:justify-center"
    >
      <z-slider-track [orientation]="orientation()">
        @if (showTickMarks()) {
          @for (tick of ticks(); track tick.key) {
            <span
              data-slot="slider-tick"
              [attr.data-orientation]="orientation()"
              [class]="tickClasses()"
              [style.left]="orientation() === 'horizontal' ? tick.percent + '%' : null"
              [style.bottom]="orientation() === 'vertical' ? tick.percent + '%' : null"
            ></span>
          }
        }

        <z-slider-range
          [orientation]="orientation()"
          [startPercent]="rangeStartPercent()"
          [endPercent]="rangeEndPercent()"
        />
      </z-slider-track>

      @for (thumb of thumbViewModels(); track thumb.index) {
        <z-slider-thumb
          [index]="thumb.index"
          [orientation]="orientation()"
          [percent]="thumb.percent"
          [value]="thumb.value"
          [min]="min()"
          [max]="max()"
          [disabled]="disabled()"
          [active]="activeThumbIndex() === thumb.index"
          [showLabel]="showValueLabel() && (dragging() || focusedThumbIndex() === thumb.index)"
          [label]="formatValue()(thumb.value)"
          (keydown)="handleKeydown(thumb.index, $event)"
          (focusin)="handleThumbFocus(thumb.index)"
          (focusout)="handleThumbBlur(thumb.index, $event)"
        />
      }
    </span>
  `,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ZardSliderComponent),
      multi: true,
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'classes()',
    '[attr.data-orientation]': 'orientation()',
    '[attr.aria-disabled]': 'disabled() ? true : null',
    '[attr.data-disabled]': 'disabled() ? true : null',
  },
  exportAs: 'zSlider',
})
export class ZardSliderComponent implements ControlValueAccessor, AfterViewInit, OnChanges, OnDestroy {
  readonly min = input(0, { transform: numberAttribute });
  readonly max = input(100, { transform: numberAttribute });
  readonly defaultValue = input<ZardSliderValue | null>(null);
  readonly value = input<ZardSliderValue | null>(null);
  readonly step = input(1, { transform: numberAttribute });
  readonly disabledInput = input(false, { transform: booleanAttribute });
  readonly mode = input<ZardSliderMode>('single');
  readonly orientation = input<'horizontal' | 'vertical'>('horizontal');
  readonly showTickMarks = input(false, { transform: booleanAttribute });
  readonly showValueLabel = input(false, { transform: booleanAttribute });
  readonly formatValue = input<(value: number) => string>((value: number) => `${value}`);
  readonly class = input<ClassValue>('');

  readonly valueChange = output<ZardSliderValue>();
  readonly changeEnd = output<ZardSliderValue>();

  readonly trackRef = viewChild.required(ZSliderTrackComponent);
  readonly thumbRefs = viewChildren(ZSliderThumbComponent);

  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly document = inject(DOCUMENT);

  protected readonly classes = computed(() =>
    mergeClasses(
      sliderVariants({
        orientation: this.orientation(),
        disabled: this.disabled(),
      }),
      this.class(),
    ),
  );

  protected readonly tickClasses = computed(() =>
    mergeClasses(sliderTickVariants({ zOrientation: this.orientation() })),
  );

  protected readonly disabled = linkedSignal(() => this.disabledInput());
  protected readonly dragging = signal(false);
  protected readonly activeThumbIndex = signal(0);
  protected readonly focusedThumbIndex = signal<number | null>(null);

  private readonly internalValue = signal<SliderTuple>([0, 0]);
  private readonly cvaValue = signal<ZardSliderValue | null>(null);
  private readonly destroy$ = new Subject<void>();

  private pendingChangeEnd = false;

  protected readonly thumbViewModels = computed(() => {
    const [start, end] = this.internalValue();
    const values = this.mode() === 'range' ? [start, end] : [start];
    return values.map((value, index) => ({
      index,
      value,
      percent: this.valueToPercent(value),
    }));
  });

  protected readonly rangeStartPercent = computed(() => this.valueToPercent(this.internalValue()[0]));
  protected readonly rangeEndPercent = computed(() => {
    const [, end] = this.internalValue();
    return this.valueToPercent(this.mode() === 'range' ? end : this.internalValue()[0]);
  });

  protected readonly ticks = computed<SliderTick[]>(() => {
    const [min, max] = this.bounds();
    const step = this.safeStep();
    const delta = max - min;

    if (delta <= 0) {
      return [{ key: '0', percent: 0 }];
    }

    const theoreticalCount = Math.floor(delta / step) + 1;
    const count = theoreticalCount <= 51 ? theoreticalCount : 51;
    const ticks: SliderTick[] = [];

    for (let index = 0; index < count; index += 1) {
      const ratio = count === 1 ? 0 : index / (count - 1);
      const value =
        theoreticalCount <= 51 ? min + step * index : min + (delta * index) / Math.max(1, count - 1);
      ticks.push({
        key: `${index}-${Math.round(ratio * 1000)}`,
        percent: theoreticalCount <= 51 ? this.valueToPercent(value) : ratio * 100,
      });
    }

    return ticks;
  });

  private onTouched: OnTouchedType = () => {};
  private onChange: OnChangeType = () => {};

  ngAfterViewInit(): void {
    const pointerMove$ = fromEvent<PointerEvent>(this.document, 'pointermove');
    const pointerUp$ = merge(
      fromEvent<PointerEvent>(this.document, 'pointerup'),
      fromEvent<PointerEvent>(this.document, 'pointercancel'),
    );

    fromEvent<PointerEvent>(this.elementRef.nativeElement, 'pointerdown')
      .pipe(
        filter(() => !this.disabled()),
        tap(event => this.handlePointerDown(event)),
        switchMap(() =>
          pointerMove$.pipe(
            takeUntil(pointerUp$),
            tap(event => this.handlePointerMove(event)),
          ),
        ),
        takeUntil(this.destroy$),
      )
      .subscribe();

    pointerUp$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      if (!this.dragging()) {
        return;
      }

      this.dragging.set(false);
      this.emitPendingChangeEnd();
    });

    this.syncFromInputs();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (
      'min' in changes ||
      'max' in changes ||
      'step' in changes ||
      'mode' in changes ||
      'value' in changes ||
      'defaultValue' in changes
    ) {
      this.syncFromInputs();
    }

    if ('disabledInput' in changes) {
      this.disabled.set(this.disabledInput());
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  writeValue(value: ZardSliderValue | null): void {
    this.cvaValue.set(value);

    if (this.value() == null) {
      this.syncFromInputs();
    }
  }

  registerOnChange(fn: (value: ZardSliderValue) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  handleThumbFocus(index: number): void {
    this.activeThumbIndex.set(index);
    this.focusedThumbIndex.set(index);
  }

  handleThumbBlur(index: number, event: FocusEvent): void {
    if (this.focusedThumbIndex() === index) {
      this.focusedThumbIndex.set(null);
    }

    const nextTarget = event.relatedTarget as Node | null;
    if (nextTarget && this.elementRef.nativeElement.contains(nextTarget)) {
      return;
    }

    this.emitChangeEnd();
  }

  handleKeydown(index: number, event: KeyboardEvent): void {
    if (this.disabled()) {
      return;
    }

    const key = event.key;
    if (!['Home', 'End', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key)) {
      return;
    }

    event.preventDefault();
    this.activeThumbIndex.set(index);

    const nextTuple = [...this.internalValue()] as [number, number];
    const step = this.safeStep();
    const [min, max] = this.bounds();
    const current = nextTuple[index];
    let nextValue = current;

    switch (key) {
      case 'Home':
        nextValue = min;
        break;
      case 'End':
        nextValue = max;
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        nextValue = current - step;
        break;
      case 'ArrowRight':
      case 'ArrowUp':
        nextValue = current + step;
        break;
      default:
        return;
    }

    const changed = this.applyNormalizedTuple(this.updateThumbValue(nextTuple, index, nextValue));
    if (!changed) {
      return;
    }

    this.onTouched();
    this.emitChangeEnd();
  }

  private handlePointerDown(event: PointerEvent): void {
    const target = event.target as HTMLElement;
    const directThumbIndex = this.findThumbIndex(target);
    const thumbIndex = directThumbIndex ?? this.findClosestThumbIndex(this.coordinateToValue(event));

    this.activeThumbIndex.set(thumbIndex);
    this.dragging.set(true);
    this.focusThumb(thumbIndex);

    if (directThumbIndex == null) {
      this.pendingChangeEnd = this.applyNormalizedTuple(
        this.updateThumbValue(this.internalValue(), thumbIndex, this.coordinateToValue(event)),
      );
      this.onTouched();
    }

    event.preventDefault();
  }

  private handlePointerMove(event: PointerEvent): void {
    if (this.disabled()) {
      return;
    }

    const changed = this.applyNormalizedTuple(
      this.updateThumbValue(this.internalValue(), this.activeThumbIndex(), this.coordinateToValue(event)),
    );

    if (changed) {
      this.pendingChangeEnd = true;
      this.onTouched();
    }
  }

  private focusThumb(index: number): void {
    requestAnimationFrame(() => {
      this.thumbRefs()[index]?.nativeElement.focus();
    });
  }

  private syncFromInputs(): void {
    const nextTuple = this.normalizeValue(this.resolveSourceValue());
    this.internalValue.set(nextTuple);
    this.activeThumbIndex.set(this.mode() === 'range' ? this.activeThumbIndex() : 0);
  }

  private resolveSourceValue(): ZardSliderValue | null {
    return this.value() ?? this.cvaValue() ?? this.defaultValue();
  }

  private normalizeValue(value: ZardSliderValue | null | undefined): SliderTuple {
    const [min, max] = this.bounds();
    const step = this.safeStep();

    if (this.mode() === 'range') {
      const tuple = Array.isArray(value) ? value : [value ?? min, value ?? min];
      const start = roundToStep(clamp(Number(tuple[0] ?? min), [min, max]), min, step);
      const end = roundToStep(clamp(Number(tuple[1] ?? start), [min, max]), min, step);
      return start <= end ? [start, end] : [end, start];
    }

    const scalar = Array.isArray(value) ? value[0] : value;
    const normalized = roundToStep(clamp(Number(scalar ?? min), [min, max]), min, step);
    return [normalized, normalized];
  }

  private updateThumbValue(tuple: SliderTuple, index: number, rawValue: number): SliderTuple {
    const [min, max] = this.bounds();
    const step = this.safeStep();
    const normalized = roundToStep(clamp(rawValue, [min, max]), min, step);

    if (this.mode() !== 'range') {
      return [normalized, normalized];
    }

    const nextTuple = [...tuple] as [number, number];

    if (index === 0) {
      nextTuple[0] = Math.min(normalized, nextTuple[1]);
    } else {
      nextTuple[1] = Math.max(normalized, nextTuple[0]);
    }

    return nextTuple;
  }

  private applyNormalizedTuple(nextTuple: SliderTuple): boolean {
    const currentTuple = this.internalValue();
    if (currentTuple[0] === nextTuple[0] && currentTuple[1] === nextTuple[1]) {
      return false;
    }

    this.internalValue.set(nextTuple);
    const emittedValue = this.toOutputValue(nextTuple);
    this.onChange(emittedValue);
    this.valueChange.emit(emittedValue);

    return true;
  }

  private emitPendingChangeEnd(): void {
    if (!this.pendingChangeEnd) {
      return;
    }

    this.pendingChangeEnd = false;
    this.emitChangeEnd();
  }

  private emitChangeEnd(): void {
    this.changeEnd.emit(this.toOutputValue(this.internalValue()));
  }

  private toOutputValue(tuple: SliderTuple): ZardSliderValue {
    return this.mode() === 'range' ? tuple : tuple[0];
  }

  private findThumbIndex(target: HTMLElement | null): number | null {
    if (!target) {
      return null;
    }

    const thumbs = this.thumbRefs();
    for (let index = 0; index < thumbs.length; index += 1) {
      if (thumbs[index].nativeElement.contains(target)) {
        return index;
      }
    }

    return null;
  }

  private findClosestThumbIndex(value: number): number {
    if (this.mode() !== 'range') {
      return 0;
    }

    const [start, end] = this.internalValue();
    return Math.abs(value - start) <= Math.abs(value - end) ? 0 : 1;
  }

  private coordinateToValue(event: PointerEvent): number {
    const rect = this.trackRef().nativeElement.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return this.internalValue()[this.activeThumbIndex()];
    }

    const ratio =
      this.orientation() === 'vertical'
        ? clamp(1 - (event.clientY - rect.top) / rect.height, [0, 1])
        : clamp((event.clientX - rect.left) / rect.width, [0, 1]);

    const [min, max] = this.bounds();
    return min + (max - min) * ratio;
  }

  private valueToPercent(value: number): number {
    const [min, max] = this.bounds();
    if (max === min) {
      return 0;
    }

    return convertValueToPercentage(value, min, max);
  }

  private bounds(): [number, number] {
    const min = this.min();
    const max = this.max();
    return min <= max ? [min, max] : [max, min];
  }

  private safeStep(): number {
    const step = this.step();
    return Number.isFinite(step) && step > 0 ? step : 1;
  }
}
