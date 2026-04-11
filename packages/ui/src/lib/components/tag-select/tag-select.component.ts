import { Overlay, OverlayModule, OverlayPositionBuilder, type OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import { isPlatformBrowser } from '@angular/common';
import {
  afterNextRender,
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  forwardRef,
  inject,
  Injector,
  input,
  linkedSignal,
  output,
  PLATFORM_ID,
  runInInjectionContext,
  signal,
  type TemplateRef,
  viewChild,
  ViewContainerRef,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { type ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

import type { ClassValue } from 'clsx';
import { filter } from 'rxjs';

import { ZardPopoverComponent } from '@/src/lib/components/popover';
import { mergeClasses } from '@/shared/utils/merge-classes';

import { ZardTagSelectInputTriggerComponent } from './input-trigger.component';
import { ZardTagSelectOptionListComponent } from './option-list.component';
import type {
  ZardTagSelectCompareWith,
  ZardTagSelectCreateValueFromInput,
  ZardTagSelectDisplayWith,
  ZardTagSelectMode,
  ZardTagSelectOption,
} from './tag-select.types';
import {
  addTagSelectValue,
  filterTagSelectOptions,
  findExactLabelMatchOption,
  hasTagSelectValue,
  removeTagSelectValue,
  resolveTagSelectLabel,
  valuesEqual,
} from './use-selection';
import {
  normalizeTagSelectToken,
  tokenizePastedValue,
  tokenizeTypedValue,
} from './use-tokenization';

@Component({
  selector: 'z-tag-select',
  imports: [OverlayModule, ZardPopoverComponent, ZardTagSelectInputTriggerComponent, ZardTagSelectOptionListComponent],
  templateUrl: './tag-select.component.html',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ZardTagSelectComponent),
      multi: true,
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
  },
  exportAs: 'zTagSelect',
})
export class ZardTagSelectComponent implements ControlValueAccessor {
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly overlay = inject(Overlay);
  private readonly overlayPositionBuilder = inject(OverlayPositionBuilder);
  private readonly viewContainerRef = inject(ViewContainerRef);
  private readonly platformId = inject(PLATFORM_ID);

  readonly overlayTemplate = viewChild.required<TemplateRef<void>>('overlayTemplate');
  readonly triggerRef = viewChild.required<ElementRef<HTMLElement>>('triggerRef');
  readonly inputTrigger = viewChild.required(ZardTagSelectInputTriggerComponent);

  private overlayRef?: OverlayRef;
  private portal?: TemplatePortal;
  private autoFocused = false;

  readonly class = input<ClassValue>('');
  readonly mode = input<ZardTagSelectMode>('tags');
  readonly value = input<readonly unknown[] | null | undefined>(undefined);
  readonly options = input<readonly ZardTagSelectOption<unknown>[]>([]);
  readonly placeholder = input('Add item...');
  readonly allowCreate = input(false, { transform: booleanAttribute });
  readonly enableSuggestions = input(false, { transform: booleanAttribute });
  readonly searchable = input(true, { transform: booleanAttribute });
  readonly tokenSeparators = input<readonly string[]>([',']);
  readonly clearable = input(false, { transform: booleanAttribute });
  readonly addOnBlur = input(false, { transform: booleanAttribute });
  readonly autoFocus = input(false, { transform: booleanAttribute });
  readonly compareWith = input<ZardTagSelectCompareWith<unknown> | null>(null);
  readonly displayWith = input<ZardTagSelectDisplayWith<unknown> | null>(null);
  readonly createValueFromInput = input<ZardTagSelectCreateValueFromInput<unknown> | null>(null);
  readonly zDisabled = input(false, { transform: booleanAttribute });

  readonly valueChange = output<unknown[]>();
  readonly zSearchTermChange = output<string>();
  readonly zBlur = output<void>();

  protected readonly disabledState = linkedSignal(() => this.zDisabled());
  protected readonly internalValues = signal<unknown[]>([]);
  protected readonly inputValue = signal('');
  protected readonly activeIndex = signal(-1);
  protected readonly inputFocused = signal(false);

  protected readonly classes = computed(() => mergeClasses('w-full', this.class()));
  protected readonly currentValues = computed(() => {
    const incoming = this.value();
    return Array.isArray(incoming) ? [...incoming] : [...this.internalValues()];
  });
  protected readonly supportsStringCreation = computed(
    () => this.mode() === 'tags' && this.currentValues().every((value) => typeof value === 'string'),
  );
  protected readonly canCreate = computed(
    () => this.allowCreate() && this.mode() === 'tags' && (this.supportsStringCreation() || !!this.createValueFromInput()),
  );
  protected readonly canInput = computed(() => {
    if (this.disabledState()) {
      return false;
    }

    if (this.mode() === 'multiple') {
      return this.enableSuggestions();
    }

    return this.allowCreate() || this.enableSuggestions();
  });
  protected readonly displayItems = computed(() =>
    this.currentValues().map((value, index) => ({
      key: `${this.resolveDisplayLabel(value)}:${index}`,
      label: this.resolveDisplayLabel(value),
    })),
  );
  protected readonly normalizedSearch = computed(() => normalizeTagSelectToken(this.inputValue()));
  protected readonly availableOptions = computed(() =>
    this.options().filter(
      (option) =>
        !hasTagSelectValue(this.currentValues(), option.value, this.compareWith(), this.mode() === 'tags'),
    ),
  );
  protected readonly visibleOptions = computed(() => {
    if (!this.enableSuggestions()) {
      return [];
    }

    return filterTagSelectOptions(this.availableOptions(), this.inputValue(), this.searchable());
  });
  protected readonly exactMatchOption = computed(() =>
    this.enableSuggestions() ? findExactLabelMatchOption(this.inputValue(), this.availableOptions()) : null,
  );
  protected readonly showClear = computed(() => !!this.currentValues().length || !!this.inputValue());
  protected readonly shouldOpenSuggestions = computed(
    () => this.enableSuggestions() && this.inputFocused() && this.visibleOptions().length > 0,
  );

  private onChange: (value: unknown[]) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  private readonly syncActiveOption = effect(() => {
    const visibleOptions = this.visibleOptions();
    const exactMatchOption = this.exactMatchOption();

    if (!visibleOptions.length) {
      this.activeIndex.set(-1);
      return;
    }

    if (exactMatchOption) {
      const nextIndex = visibleOptions.findIndex((option) =>
        valuesEqual(option.value, exactMatchOption.value, this.compareWith()),
      );
      this.activeIndex.set(nextIndex);
      return;
    }

    this.activeIndex.set(-1);
  });

  private readonly syncOverlay = effect(() => {
    if (this.shouldOpenSuggestions()) {
      this.openSuggestions();
      this.updateOverlaySize();
    } else {
      this.closeSuggestions();
    }
  });

  private readonly focusInputWhenInteractive = effect(() => {
    if (!this.autoFocus() || !this.canInput() || this.disabledState() || this.autoFocused) {
      return;
    }

    runInInjectionContext(this.injector, () => {
      afterNextRender(() => {
        if (!this.autoFocus() || !this.canInput() || this.disabledState() || this.autoFocused) {
          return;
        }

        this.focusInput();
        this.autoFocused = true;
      });
    });
  });

  protected onInputValueChange(value: string): void {
    if (!this.canCreate()) {
      this.setInputValue(value);
      return;
    }

    const tokenizationResult = tokenizeTypedValue(value, this.tokenSeparators());
    if (!tokenizationResult.committedTokens.length) {
      this.setInputValue(value);
      return;
    }

    this.commitTexts(tokenizationResult.committedTokens);
    this.setInputValue(tokenizationResult.remainder);
    this.focusInput();
  }

  protected onInputKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'Enter':
        event.preventDefault();
        this.commitFromEnter();
        break;
      case 'Backspace':
        if (!this.inputValue() && this.currentValues().length) {
          event.preventDefault();
          this.removeLast();
        }
        break;
      case 'ArrowDown':
        if (this.enableSuggestions()) {
          event.preventDefault();
          this.moveActive(1);
        }
        break;
      case 'ArrowUp':
        if (this.enableSuggestions()) {
          event.preventDefault();
          this.moveActive(-1);
        }
        break;
      case 'Escape':
        this.activeIndex.set(-1);
        this.inputFocused.set(false);
        this.closeSuggestions();
        break;
      default:
        break;
    }
  }

  protected onInputPaste(event: ClipboardEvent): void {
    if (!this.canCreate()) {
      return;
    }

    const pastedText = event.clipboardData?.getData('text') ?? '';
    const pastedTokens = tokenizePastedValue(pastedText, this.tokenSeparators());
    if (!pastedTokens.length) {
      return;
    }

    event.preventDefault();
    this.commitTexts(pastedTokens);
    this.inputValue.set('');
    this.focusInput();
  }

  protected onInputFocus(): void {
    this.inputFocused.set(true);
  }

  protected onInputBlur(): void {
    this.inputFocused.set(false);
    if (this.addOnBlur() && this.canCreate()) {
      this.commitPendingInput();
    }
    this.onTouched();
    this.zBlur.emit();
  }

  protected onOptionSelected(option: ZardTagSelectOption<unknown>): void {
    this.selectOption(option);
  }

  protected onActiveIndexChange(index: number): void {
    this.activeIndex.set(index);
  }

  protected removeAt(index: number): void {
    const value = this.currentValues()[index];
    if (value === undefined) {
      return;
    }

    this.emitValues(removeTagSelectValue(this.currentValues(), value, this.compareWith(), this.mode() === 'tags'));
    this.focusInput();
  }

  protected clearAll(): void {
    this.setInputValue('');
    this.emitValues([]);
    this.activeIndex.set(-1);
    this.focusInput();
  }

  writeValue(value: unknown[] | null): void {
    this.internalValues.set(Array.isArray(value) ? [...value] : []);
  }

  registerOnChange(fn: (value: unknown[]) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabledState.set(isDisabled);
  }

  private focusInput(): void {
    if (!this.canInput() || !isPlatformBrowser(this.platformId)) {
      return;
    }

    this.inputTrigger()?.focusInput();
  }

  private commitFromEnter(): void {
    const activeOption = this.visibleOptions()[this.activeIndex()] ?? this.exactMatchOption();
    if (activeOption) {
      this.selectOption(activeOption);
      return;
    }

    if (!this.canCreate()) {
      return;
    }

    const normalized = normalizeTagSelectToken(this.inputValue());
    if (!normalized) {
      return;
    }

    this.commitTexts([normalized]);
    this.setInputValue('');
    this.focusInput();
  }

  private commitTexts(values: readonly string[]): void {
    let nextValues = this.currentValues();

    for (const rawValue of values) {
      const normalized = normalizeTagSelectToken(rawValue);
      if (!normalized) {
        continue;
      }

      const matchingOption = this.enableSuggestions()
        ? findExactLabelMatchOption(normalized, this.availableOptions())
        : null;

      if (matchingOption) {
        nextValues = addTagSelectValue(nextValues, matchingOption.value, this.compareWith(), this.mode() === 'tags');
        continue;
      }

      if (!this.canCreate()) {
        continue;
      }

      const createdValue = this.createValueFromInput()?.(normalized) ?? normalized;
      if (createdValue == null) {
        continue;
      }

      nextValues = addTagSelectValue(
        nextValues,
        createdValue,
        this.compareWith(),
        typeof createdValue === 'string',
      );
    }

    this.emitValues(nextValues);
  }

  private selectOption(option: ZardTagSelectOption<unknown>): void {
    const nextValues = addTagSelectValue(this.currentValues(), option.value, this.compareWith(), this.mode() === 'tags');
    this.emitValues(nextValues);
    this.setInputValue('');
    this.activeIndex.set(-1);
    this.focusInput();
  }

  private removeLast(): void {
    const currentValues = this.currentValues();
    const lastValue = currentValues[currentValues.length - 1];
    if (lastValue === undefined) {
      return;
    }

    this.emitValues(removeTagSelectValue(currentValues, lastValue, this.compareWith(), this.mode() === 'tags'));
    this.focusInput();
  }

  private moveActive(direction: 1 | -1): void {
    const visibleOptions = this.visibleOptions();
    if (!visibleOptions.length) {
      this.activeIndex.set(-1);
      return;
    }

    const enabledIndexes = visibleOptions
      .map((option, index) => (!option.disabled ? index : -1))
      .filter((index) => index >= 0);

    if (!enabledIndexes.length) {
      this.activeIndex.set(-1);
      return;
    }

    const currentIndex = this.activeIndex();
    if (currentIndex < 0) {
      this.activeIndex.set(direction === 1 ? enabledIndexes[0] : enabledIndexes[enabledIndexes.length - 1]);
      return;
    }

    const currentEnabledPosition = enabledIndexes.findIndex((index) => index === currentIndex);
    const nextPosition =
      currentEnabledPosition < 0
        ? direction === 1
          ? 0
          : enabledIndexes.length - 1
        : (currentEnabledPosition + direction + enabledIndexes.length) % enabledIndexes.length;

    this.activeIndex.set(enabledIndexes[nextPosition]);
  }

  private emitValues(values: readonly unknown[]): void {
    const nextValues = [...values];
    this.internalValues.set(nextValues);
    this.onChange(nextValues);
    this.valueChange.emit(nextValues);
    this.updateOverlaySize();
  }

  private commitPendingInput(): void {
    const normalized = normalizeTagSelectToken(this.inputValue());
    if (!normalized) {
      this.setInputValue('');
      return;
    }

    const activeOption = this.exactMatchOption();
    if (activeOption) {
      this.selectOption(activeOption);
      return;
    }

    if (!this.canCreate()) {
      return;
    }

    this.commitTexts([normalized]);
    this.setInputValue('');
  }

  private setInputValue(value: string): void {
    this.inputValue.set(value);
    this.zSearchTermChange.emit(value);
  }

  private resolveDisplayLabel(value: unknown): string {
    const displayWith = this.displayWith();
    if (displayWith) {
      return displayWith(value);
    }

    return resolveTagSelectLabel(value, this.options(), this.compareWith());
  }

  private openSuggestions(): void {
    if (!this.enableSuggestions() || !isPlatformBrowser(this.platformId)) {
      return;
    }

    if (!this.overlayRef) {
      this.createOverlay();
    }

    if (!this.overlayRef) {
      return;
    }

    if (this.overlayRef.hasAttached()) {
      return;
    }

    this.portal = new TemplatePortal(this.overlayTemplate(), this.viewContainerRef);
    this.overlayRef.attach(this.portal);
    this.updateOverlaySize();
  }

  private closeSuggestions(): void {
    if (this.overlayRef?.hasAttached()) {
      this.overlayRef.detach();
    }
  }

  private updateOverlaySize(): void {
    if (!this.overlayRef) {
      return;
    }

    const triggerWidth = this.triggerRef().nativeElement.offsetWidth || 0;
    if (triggerWidth) {
      this.overlayRef.updateSize({ width: triggerWidth });
      this.overlayRef.updatePosition();
    }
  }

  private createOverlay(): void {
    if (!isPlatformBrowser(this.platformId) || this.overlayRef) {
      return;
    }

    const positionStrategy = this.overlayPositionBuilder
      .flexibleConnectedTo(this.triggerRef())
      .withPositions([
        {
          originX: 'start',
          originY: 'bottom',
          overlayX: 'start',
          overlayY: 'top',
          offsetY: 4,
        },
        {
          originX: 'start',
          originY: 'top',
          overlayX: 'start',
          overlayY: 'bottom',
          offsetY: -4,
        },
      ])
      .withFlexibleDimensions(false)
      .withPush(false);

    this.overlayRef = this.overlay.create({
      positionStrategy,
      hasBackdrop: false,
      scrollStrategy: this.overlay.scrollStrategies.reposition(),
    });

    this.overlayRef
      .outsidePointerEvents()
      .pipe(
        filter((event) => {
          const target = event.target;
          if (!(target instanceof Node)) {
            return true;
          }

          return (
            !this.triggerRef().nativeElement.contains(target) && !this.overlayRef?.overlayElement.contains(target)
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        this.inputFocused.set(false);
        this.closeSuggestions();
      });
  }
}
