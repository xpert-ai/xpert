import { NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChild,
  Directive,
  effect,
  ElementRef,
  forwardRef,
  inject,
  Injector,
  input,
  output,
  runInInjectionContext,
  signal,
  TemplateRef,
  viewChild,
  viewChildren,
  ViewEncapsulation,
} from '@angular/core';
import { type ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

import type { ClassValue } from 'clsx';

import { ZardButtonComponent, type ZardButtonTypeVariants } from '@/shared/components/button';
import { comboboxVariants, type ZardComboboxWidthVariants } from '@/shared/components/combobox/combobox.variants';
import { ZardEmptyComponent } from '@/shared/components/empty';
import { ZardIconComponent, type ZardIcon } from '@/shared/components/icon';
import { ZardInputDirective } from '@/shared/components/input';
import {
  ZardPopoverComponent,
  ZardPopoverDirective,
  type ZardPopoverPlacement,
} from '@/shared/components/popover';
import { mergeClasses } from '@/shared/utils/merge-classes';

let nextComboboxId = 0;

export type ZardComboboxTriggerMode = 'button' | 'input';
export type ZardComboboxValue = unknown;
export type ZardComboboxDisplayWith = (
  option: ZardComboboxOption | null,
  value: ZardComboboxValue | null,
) => string;
export type ZardComboboxCompareWith = (
  a: ZardComboboxValue | null,
  b: ZardComboboxValue | null,
) => boolean;
export type ZardComboboxFilterWith = (option: ZardComboboxOption, searchTerm: string) => boolean;

export interface ZardComboboxOption<TValue = ZardComboboxValue, TData = unknown> {
  id?: string | number;
  value: TValue;
  label?: string;
  disabled?: boolean;
  icon?: ZardIcon;
  keywords?: string[];
  data?: TData;
}

export interface ZardComboboxGroup<TValue = ZardComboboxValue, TData = unknown> {
  id?: string | number;
  label?: string;
  options: ZardComboboxOption<TValue, TData>[];
}

export interface ZardComboboxOptionContext {
  $implicit: ZardComboboxOption;
  active: boolean;
  index: number;
  searchTerm: string;
  select: (option: ZardComboboxOption) => void;
  selected: boolean;
}

export interface ZardComboboxPanelContext {
  $implicit: ZardComboboxOption[];
  activeIndex: number;
  close: () => void;
  currentValue: ZardComboboxValue | null;
  groups: Array<{ label?: string; options: ZardComboboxOption[] }>;
  open: boolean;
  searchTerm: string;
  select: (option: ZardComboboxOption) => void;
  setActiveIndex: (index: number) => void;
}

interface ZardComboboxOptionEntry {
  id: string;
  index: number;
  option: ZardComboboxOption;
}

interface ZardComboboxGroupEntry {
  id: string;
  label?: string;
  options: ZardComboboxOptionEntry[];
}

@Directive({
  selector: 'ng-template[zComboboxOption]',
  standalone: true,
})
export class ZardComboboxOptionTemplateDirective {
  constructor(public readonly template: TemplateRef<ZardComboboxOptionContext>) {}
}

@Directive({
  selector: 'ng-template[zComboboxPanel]',
  standalone: true,
})
export class ZardComboboxPanelTemplateDirective {
  constructor(public readonly template: TemplateRef<ZardComboboxPanelContext>) {}
}

@Component({
  selector: 'z-combobox',
  imports: [
    NgTemplateOutlet,
    ZardButtonComponent,
    ZardComboboxOptionTemplateDirective,
    ZardComboboxPanelTemplateDirective,
    ZardEmptyComponent,
    ZardIconComponent,
    ZardInputDirective,
    ZardPopoverDirective,
    ZardPopoverComponent,
  ],
  template: `
    <div
      class="block w-full"
      zPopover
      [zContent]="popoverContent"
      [zPlacement]="zPlacement()"
      [zTrigger]="zTriggerMode() === 'button' ? 'click' : null"
      (zVisibleChange)="setOpenState($event)"
      #popoverTrigger="zPopover"
      #triggerHost
    >
      @if (zTriggerMode() === 'button') {
        <button
          type="button"
          z-button
          role="combobox"
          [zDisabled]="isDisabled()"
          [zType]="buttonVariant()"
          [class]="buttonClasses()"
          [attr.aria-expanded]="isOpen()"
          [attr.aria-haspopup]="'listbox'"
          [attr.aria-controls]="listboxId"
          [attr.aria-label]="ariaLabel() || 'Select option'"
          [attr.aria-describedby]="ariaDescribedBy()"
          [attr.aria-activedescendant]="activeOptionId()"
          [attr.aria-autocomplete]="searchable() ? 'list' : 'none'"
          (keydown)="onButtonKeyDown($event)"
        >
          <span class="min-w-0 flex-1 truncate text-left">
            {{ displayValue() || placeholder() }}
          </span>

          <span class="ml-2 flex shrink-0 items-center gap-1">
            @if (zClearable() && hasValue()) {
              <button
                type="button"
                z-button
                zType="ghost"
                zSize="icon"
                zShape="circle"
                class="size-6"
                [zDisabled]="isDisabled()"
                (click)="clearValue($event)"
              >
                <z-icon zType="close" class="opacity-70" />
              </button>
            }

            <z-icon zType="chevrons-up-down" class="opacity-50" />
          </span>
        </button>
      } @else {
        <div class="relative">
          <input
            #inputRef
            type="text"
            z-input
            role="combobox"
            class="w-full pr-10"
            [disabled]="isDisabled()"
            [placeholder]="placeholder()"
            [value]="inputValue()"
            [attr.aria-expanded]="isOpen()"
            [attr.aria-haspopup]="'listbox'"
            [attr.aria-controls]="listboxId"
            [attr.aria-label]="ariaLabel() || placeholder() || 'Select option'"
            [attr.aria-describedby]="ariaDescribedBy()"
            [attr.aria-activedescendant]="activeOptionId()"
            [attr.aria-autocomplete]="searchable() ? 'list' : 'none'"
            (focus)="onInputFocus($event)"
            (blur)="onInputBlur($event)"
            (input)="onInput($event)"
            (keydown)="onInputKeyDown($event)"
          />

          <div class="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
            @if (zClearable() && hasValue()) {
              <button
                type="button"
                z-button
                zType="ghost"
                zSize="icon"
                zShape="circle"
                class="size-6"
                [zDisabled]="isDisabled()"
                (click)="clearValue($event)"
              >
                <z-icon zType="close" class="opacity-70" />
              </button>
            }

            <z-icon zType="chevrons-up-down" class="pointer-events-none opacity-50" />
          </div>
        </div>
      }

      <ng-template #popoverContent>
        <z-popover [class]="popoverClasses()" [style.width]="panelWidthStyle()">
          @if (panelTemplate(); as panelTemplateRef) {
            <ng-container
              [ngTemplateOutlet]="panelTemplateRef.template"
              [ngTemplateOutletContext]="panelTemplateContext()"
            />
          } @else {
            @if (zTriggerMode() === 'button' && searchable()) {
              <div class="border-b px-3">
                <input
                  #searchInputRef
                  type="text"
                  z-input
                  zBorderless
                  class="h-10 w-full border-0 px-0 shadow-none focus-visible:ring-0"
                  [placeholder]="searchPlaceholder()"
                  [value]="searchTerm()"
                  (input)="onSearchInput($event)"
                  (keydown)="onSearchInputKeyDown($event)"
                />
              </div>
            }

            <div [id]="listboxId" role="listbox" class="max-h-60 overflow-auto p-1">
              @if (visibleGroups().length) {
                @for (group of visibleGroups(); track group.id) {
                  @if (group.label) {
                    <div class="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                      {{ group.label }}
                    </div>
                  }

                  @for (entry of group.options; track entry.id) {
                    <button
                      #optionRef
                      type="button"
                      role="option"
                      class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none transition-colors"
                      [class.bg-accent]="activeIndex() === entry.index"
                      [class.text-accent-foreground]="activeIndex() === entry.index"
                      [class.opacity-50]="entry.option.disabled"
                      [attr.aria-disabled]="entry.option.disabled || null"
                      [attr.aria-selected]="isOptionSelected(entry.option)"
                      [attr.id]="entry.id"
                      [disabled]="entry.option.disabled"
                      (mousedown)="onOptionPointerDown()"
                      (mouseenter)="setActiveIndex(entry.index)"
                      (click)="selectOption(entry.option)"
                    >
                      <ng-container
                        [ngTemplateOutlet]="optionTemplateOutlet()"
                        [ngTemplateOutletContext]="optionContext(entry)"
                      />
                    </button>
                  }
                }
              } @else if (emptyText()) {
                <div class="px-2 py-6">
                  <z-empty [zDescription]="emptyText()" />
                </div>
              }
            </div>
          }
        </z-popover>
      </ng-template>
    </div>

    <ng-template #defaultOption let-option let-selected="selected">
      @if (option.icon) {
        <z-icon [zType]="option.icon" class="shrink-0" />
      }

      <span class="min-w-0 flex-1 truncate">
        {{ option.label || getValueLabel(option.value) }}
      </span>

      @if (selected) {
        <z-icon zType="check" class="ml-auto shrink-0" />
      }
    </ng-template>
  `,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ZardComboboxComponent),
      multi: true,
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'classes()',
  },
  exportAs: 'zCombobox',
})
export class ZardComboboxComponent implements ControlValueAccessor {
  private readonly injector = inject(Injector);
  private readonly comboboxId = ++nextComboboxId;

  readonly class = input<ClassValue>('');
  readonly buttonVariant = input<ZardButtonTypeVariants>('outline');
  readonly zWidth = input<ZardComboboxWidthVariants>('default');
  readonly zTriggerMode = input<ZardComboboxTriggerMode>('button');
  readonly zPlacement = input<ZardPopoverPlacement>('bottom');
  readonly zPanelWidth = input<string | number | null>(null);
  readonly zClearable = input(false, { transform: booleanAttribute });
  readonly placeholder = input<string>('Select...');
  readonly searchPlaceholder = input<string>('Search...');
  readonly emptyText = input<string>('No results found.');
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly searchable = input(true, { transform: booleanAttribute });
  readonly allowCustomValue = input(false, { transform: booleanAttribute });
  readonly zSelectOnEnter = input(true, { transform: booleanAttribute });
  readonly value = input<ZardComboboxValue | null | undefined>(undefined);
  readonly options = input<ZardComboboxOption[]>([]);
  readonly groups = input<ZardComboboxGroup[]>([]);
  readonly ariaLabel = input<string>('');
  readonly ariaDescribedBy = input<string>('');
  readonly zDisplayWith = input<ZardComboboxDisplayWith | null>(null);
  readonly zCompareWith = input<ZardComboboxCompareWith | null>(null);
  readonly zFilterWith = input<ZardComboboxFilterWith | null>(null);
  readonly zSearchTerm = input<string | null>(null);
  readonly zOpen = input<boolean | null>(null);

  readonly zValueChange = output<ZardComboboxValue | null>();
  readonly zComboSelected = output<ZardComboboxOption>();
  readonly zSearchTermChange = output<string>();
  readonly zOpenChange = output<boolean>();
  readonly zCustomValueSubmit = output<string>();
  readonly zBlur = output<FocusEvent>();
  readonly zFocus = output<FocusEvent>();

  readonly optionTemplate = contentChild(ZardComboboxOptionTemplateDirective);
  readonly panelTemplate = contentChild(ZardComboboxPanelTemplateDirective);

  readonly defaultOption = viewChild.required<TemplateRef<ZardComboboxOptionContext>>('defaultOption');
  readonly popoverDirective = viewChild('popoverTrigger', { read: ZardPopoverDirective });
  readonly triggerHostRef = viewChild('triggerHost', { read: ElementRef<HTMLElement> });
  readonly inputRef = viewChild('inputRef', { read: ElementRef<HTMLInputElement> });
  readonly searchInputRef = viewChild('searchInputRef', { read: ElementRef<HTMLInputElement> });
  readonly optionRefs = viewChildren('optionRef', { read: ElementRef<HTMLElement> });

  protected readonly internalOpen = signal(false);
  protected readonly internalValue = signal<ZardComboboxValue | null>(null);
  protected readonly internalSearchTerm = signal('');
  protected readonly activeIndex = signal(-1);
  protected readonly inputFocused = signal(false);
  protected readonly inputDirty = signal(false);
  protected readonly cvaDisabled = signal(false);
  protected readonly triggerWidth = signal<number | null>(null);
  protected readonly pointerSelecting = signal(false);

  protected readonly classes = computed(() =>
    mergeClasses(
      'block',
      comboboxVariants({
        zWidth: this.zWidth(),
      }),
      this.class(),
    ),
  );

  protected readonly buttonClasses = computed(() => 'w-full justify-between');

  protected readonly popoverClasses = computed(() =>
    mergeClasses('p-0', this.zTriggerMode() === 'input' ? 'w-full' : null),
  );

  protected readonly isDisabled = computed(() => this.disabled() || this.cvaDisabled());

  protected readonly currentValue = computed<ZardComboboxValue | null>(() => {
    const value = this.value();
    return value === undefined ? this.internalValue() : value;
  });

  protected readonly baseGroups = computed<ZardComboboxGroup[]>(() => {
    const entries: ZardComboboxGroup[] = [];

    if (this.options().length) {
      entries.push({
        options: this.options(),
      });
    }

    entries.push(...this.groups());
    return entries;
  });

  protected readonly searchTerm = computed(() => {
    const externalSearchTerm = this.zSearchTerm();
    return externalSearchTerm === null ? this.internalSearchTerm() : externalSearchTerm;
  });

  protected readonly isOpen = computed(() => {
    const externalOpen = this.zOpen();
    return externalOpen === null ? this.internalOpen() : externalOpen;
  });

  protected readonly flatOptions = computed(() =>
    this.baseGroups().flatMap(group => group.options).filter(Boolean),
  );

  protected readonly currentOption = computed(() => {
    const currentValue = this.currentValue();
    if (currentValue === null || currentValue === undefined) {
      return null;
    }

    return (
      this.flatOptions().find(option => this.compareValues(option.value, currentValue)) ?? null
    );
  });

  protected readonly displayValue = computed(() => {
    const currentValue = this.currentValue();
    if (currentValue === null || currentValue === undefined) {
      return '';
    }

    const currentOption = this.currentOption();
    const displayWith = this.zDisplayWith();
    if (displayWith) {
      return displayWith(currentOption, currentValue) ?? '';
    }

    if (currentOption?.label) {
      return currentOption.label;
    }

    return this.getValueLabel(currentValue);
  });

  protected readonly inputValue = computed(() => {
    if (!this.inputFocused() && !this.isOpen()) {
      return this.displayValue();
    }

    const searchTerm = this.searchTerm();
    if (searchTerm !== '') {
      return searchTerm;
    }

    return this.displayValue();
  });

  protected readonly hasValue = computed(() => {
    const currentValue = this.currentValue();
    return currentValue !== null && currentValue !== undefined;
  });

  protected readonly visibleGroups = computed<ZardComboboxGroupEntry[]>(() => {
    const searchTerm = this.searchTerm().trim();
    let index = 0;

    return this.baseGroups()
      .map((group, groupIndex) => {
        const options = group.options
          .filter(option => this.optionMatches(option, searchTerm))
          .map(option => {
            const optionId = this.getOptionId(option, index);
            const entry: ZardComboboxOptionEntry = {
              id: optionId,
              index,
              option,
            };

            index += 1;
            return entry;
          });

        return {
          id: this.getGroupId(group, groupIndex),
          label: group.label,
          options,
        };
      })
      .filter(group => group.options.length > 0);
  });

  protected readonly visibleOptions = computed(() =>
    this.visibleGroups().flatMap(group => group.options),
  );

  protected readonly activeOptionId = computed(() => {
    const activeEntry = this.visibleOptions().find(option => option.index === this.activeIndex());
    return activeEntry?.id ?? null;
  });

  protected readonly optionTemplateOutlet = computed(
    () => this.optionTemplate()?.template ?? this.defaultOption(),
  );

  protected readonly panelWidthStyle = computed(() => {
    const panelWidth = this.zPanelWidth();
    if (typeof panelWidth === 'number') {
      return `${panelWidth}px`;
    }
    if (typeof panelWidth === 'string' && panelWidth.trim()) {
      return panelWidth;
    }

    const triggerWidth = this.triggerWidth();
    return triggerWidth ? `${triggerWidth}px` : null;
  });

  readonly listboxId = `z-combobox-listbox-${this.comboboxId}`;

  private onChange: (value: ZardComboboxValue | null) => void = () => {
    // ControlValueAccessor implementation
  };

  private onTouched: () => void = () => {
    // ControlValueAccessor implementation
  };

  constructor() {
    effect(
      () => {
        const searchTerm = this.zSearchTerm();
        if (searchTerm !== null) {
          this.internalSearchTerm.set(searchTerm);
        }
      },
      { allowSignalWrites: true },
    );

    effect(
      () => {
        const externalOpen = this.zOpen();
        if (externalOpen === null) {
          return;
        }

        runInInjectionContext(this.injector, () =>
          afterNextRender(() => {
            if (externalOpen) {
              this.openPanel();
            } else {
              this.closePanel();
            }
          }),
        );
      },
      { allowSignalWrites: true },
    );

    effect(
      () => {
        if (this.zTriggerMode() !== 'input') {
          return;
        }

        if (this.zSearchTerm() !== null) {
          return;
        }

        if (this.inputFocused() || this.isOpen()) {
          return;
        }

        this.internalSearchTerm.set(this.displayValue());
      },
      { allowSignalWrites: true },
    );

    effect(
      () => {
        const activeIndex = this.activeIndex();
        const options = this.visibleOptions();
        const open = this.isOpen();

        if (!open || activeIndex < 0 || activeIndex >= options.length) {
          return;
        }

        runInInjectionContext(this.injector, () =>
          afterNextRender(() => {
            const optionRef = this.optionRefs()[activeIndex];
            optionRef?.nativeElement.scrollIntoView({ block: 'nearest' });

            if (this.zTriggerMode() === 'button' && !this.searchable()) {
              optionRef?.nativeElement.focus();
            }
          }),
        );
      },
      { allowSignalWrites: true },
    );

    effect(
      () => {
        const options = this.visibleOptions();
        const activeIndex = this.activeIndex();

        if (!options.length) {
          this.activeIndex.set(-1);
          return;
        }

        if (activeIndex >= options.length || activeIndex < 0) {
          this.activeIndex.set(this.getInitialActiveIndex());
        }
      },
      { allowSignalWrites: true },
    );
  }

  protected optionContext(entry: ZardComboboxOptionEntry): ZardComboboxOptionContext {
    return {
      $implicit: entry.option,
      active: this.activeIndex() === entry.index,
      index: entry.index,
      searchTerm: this.searchTerm(),
      select: option => this.selectOption(option),
      selected: this.isOptionSelected(entry.option),
    };
  }

  protected panelTemplateContext(): ZardComboboxPanelContext {
    return {
      $implicit: this.visibleOptions().map(entry => entry.option),
      activeIndex: this.activeIndex(),
      close: () => this.closePanel(),
      currentValue: this.currentValue(),
      groups: this.visibleGroups().map(group => ({
        label: group.label,
        options: group.options.map(option => option.option),
      })),
      open: this.isOpen(),
      searchTerm: this.searchTerm(),
      select: option => this.selectOption(option),
      setActiveIndex: index => this.setActiveIndex(index),
    };
  }

  protected getValueLabel(value: ZardComboboxValue | null | undefined): string {
    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value === 'string' || typeof value === 'number') {
      return `${value}`;
    }

    if (typeof value === 'object') {
      const candidate = value as Record<string, unknown>;
      if (typeof candidate['label'] === 'string') {
        return candidate['label'];
      }
      if (typeof candidate['caption'] === 'string') {
        return candidate['caption'];
      }
      if (typeof candidate['name'] === 'string') {
        return candidate['name'];
      }
      if (typeof candidate['key'] === 'string') {
        return candidate['key'];
      }
      if (typeof candidate['id'] === 'string' || typeof candidate['id'] === 'number') {
        return `${candidate['id']}`;
      }
    }

    return '';
  }

  protected isOptionSelected(option: ZardComboboxOption): boolean {
    return this.compareValues(option.value, this.currentValue());
  }

  protected onButtonKeyDown(event: KeyboardEvent): void {
    if (this.isDisabled()) {
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
      case 'Enter':
      case ' ':
        event.preventDefault();
        this.updateTriggerWidth();
        this.openPanel();
        break;
      case 'Escape':
        if (this.isOpen()) {
          event.preventDefault();
          this.closePanel();
        } else if (this.hasValue()) {
          event.preventDefault();
          this.clearValue();
        }
        break;
    }
  }

  protected onInputFocus(event: FocusEvent): void {
    if (this.isDisabled()) {
      return;
    }

    this.inputFocused.set(true);
    this.zFocus.emit(event);
    this.updateTriggerWidth();
    this.openPanel();
  }

  protected onInputBlur(event: FocusEvent): void {
    this.inputFocused.set(false);
    this.onTouched();
    this.zBlur.emit(event);

    runInInjectionContext(this.injector, () =>
      afterNextRender(() => {
        if (this.pointerSelecting()) {
          this.pointerSelecting.set(false);
          return;
        }

        if (this.allowCustomValue() && this.inputDirty()) {
          this.commitCustomValue();
        } else if (this.zSearchTerm() === null) {
          this.internalSearchTerm.set(this.displayValue());
        }

        this.closePanel();
      }),
    );
  }

  protected onInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.inputDirty.set(true);
    this.updateSearchTerm(target.value);
    this.openPanel();
  }

  protected onInputKeyDown(event: KeyboardEvent): void {
    if (this.isDisabled()) {
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        event.preventDefault();
        if (!this.isOpen()) {
          this.openPanel();
        }
        this.moveActiveIndex(event.key === 'ArrowDown' ? 1 : -1);
        break;
      case 'Enter':
        if (this.zSelectOnEnter() && this.selectActiveOption()) {
          event.preventDefault();
        } else if (this.allowCustomValue()) {
          event.preventDefault();
          this.commitCustomValue();
        }
        break;
      case 'Escape':
        if (this.isOpen()) {
          event.preventDefault();
          this.closePanel();
        }
        break;
      case 'Tab':
        this.closePanel();
        break;
      case 'Home':
        if (this.isOpen()) {
          event.preventDefault();
          this.setActiveIndex(this.getFirstEnabledIndex());
        }
        break;
      case 'End':
        if (this.isOpen()) {
          event.preventDefault();
          this.setActiveIndex(this.getLastEnabledIndex());
        }
        break;
    }
  }

  protected onSearchInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.updateSearchTerm(target.value);
  }

  protected onSearchInputKeyDown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        event.preventDefault();
        this.moveActiveIndex(event.key === 'ArrowDown' ? 1 : -1);
        break;
      case 'Enter':
        if (this.zSelectOnEnter() && this.selectActiveOption()) {
          event.preventDefault();
        }
        break;
      case 'Escape':
        event.preventDefault();
        this.closePanel();
        break;
      case 'Tab':
        this.closePanel();
        break;
      case 'Home':
        event.preventDefault();
        this.setActiveIndex(this.getFirstEnabledIndex());
        break;
      case 'End':
        event.preventDefault();
        this.setActiveIndex(this.getLastEnabledIndex());
        break;
    }
  }

  protected onOptionPointerDown(): void {
    this.pointerSelecting.set(true);
  }

  protected setActiveIndex(index: number): void {
    this.activeIndex.set(index);
  }

  protected clearValue(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.internalValue.set(null);
    this.onChange(null);
    this.zValueChange.emit(null);
    this.inputDirty.set(false);

    if (this.zSearchTerm() === null) {
      this.internalSearchTerm.set('');
    } else {
      this.zSearchTermChange.emit('');
    }

    if (this.zTriggerMode() === 'input') {
      this.inputRef()?.nativeElement.focus();
    }
  }

  protected selectOption(option: ZardComboboxOption): void {
    if (option.disabled) {
      return;
    }

    this.internalValue.set(option.value);
    this.onChange(option.value);
    this.zValueChange.emit(option.value);
    this.zComboSelected.emit(option);
    this.inputDirty.set(false);

    if (this.zTriggerMode() === 'input') {
      this.updateSearchTerm(this.resolveDisplayValue(option, option.value));
    } else {
      this.resetButtonSearch();
    }

    this.closePanel();

    runInInjectionContext(this.injector, () =>
      afterNextRender(() => {
        if (this.zTriggerMode() === 'input') {
          this.inputRef()?.nativeElement.focus();
        }
      }),
    );
  }

  writeValue(value: ZardComboboxValue | null): void {
    this.internalValue.set(value);
    if (this.zTriggerMode() === 'input' && !this.inputFocused() && this.zSearchTerm() === null) {
      this.internalSearchTerm.set(this.resolveDisplayValue(this.currentOption(), value));
    }
  }

  registerOnChange(fn: (value: ZardComboboxValue | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.cvaDisabled.set(isDisabled);
  }

  private commitCustomValue(): void {
    const rawValue = this.searchTerm().trim();
    this.inputDirty.set(false);

    if (!rawValue) {
      if (!this.hasValue()) {
        this.clearValue();
      }
      return;
    }

    if (rawValue === this.displayValue()) {
      return;
    }

    this.internalValue.set(rawValue);
    this.onChange(rawValue);
    this.zValueChange.emit(rawValue);
    this.zCustomValueSubmit.emit(rawValue);

    if (this.zSearchTerm() === null) {
      this.internalSearchTerm.set(rawValue);
    } else {
      this.zSearchTermChange.emit(rawValue);
    }
  }

  private openPanel(): void {
    if (this.isDisabled()) {
      return;
    }

    this.updateTriggerWidth();
    this.popoverDirective()?.show();
  }

  private closePanel(): void {
    this.popoverDirective()?.hide();
  }

  protected setOpenState(open: boolean): void {
    this.internalOpen.set(open);
    this.zOpenChange.emit(open);

    if (open) {
      this.updateTriggerWidth();
      this.activeIndex.set(this.getInitialActiveIndex());

      runInInjectionContext(this.injector, () =>
        afterNextRender(() => {
          if (this.zTriggerMode() === 'button' && this.searchable()) {
            this.searchInputRef()?.nativeElement.focus();
          }
        }),
      );
    } else if (this.zTriggerMode() === 'button') {
      this.resetButtonSearch();
    }
  }

  private updateTriggerWidth(): void {
    const width = this.triggerHostRef()?.nativeElement.getBoundingClientRect().width ?? 0;
    this.triggerWidth.set(width || null);
  }

  private updateSearchTerm(value: string): void {
    if (this.zSearchTerm() === null) {
      this.internalSearchTerm.set(value);
    }

    this.zSearchTermChange.emit(value);
  }

  private resetButtonSearch(): void {
    if (this.zTriggerMode() !== 'button') {
      return;
    }

    if (this.zSearchTerm() === null) {
      this.internalSearchTerm.set('');
    } else {
      this.zSearchTermChange.emit('');
    }
  }

  private selectActiveOption(): boolean {
    const activeIndex = this.activeIndex();
    if (activeIndex < 0) {
      return false;
    }

    const entry = this.visibleOptions().find(option => option.index === activeIndex);
    if (!entry || entry.option.disabled) {
      return false;
    }

    this.selectOption(entry.option);
    return true;
  }

  private moveActiveIndex(offset: number): void {
    const options = this.visibleOptions();
    if (!options.length) {
      return;
    }

    let nextIndex = this.activeIndex();
    if (nextIndex < 0) {
      nextIndex = offset > 0 ? this.getFirstEnabledIndex() : this.getLastEnabledIndex();
      this.activeIndex.set(nextIndex);
      return;
    }

    const visited = new Set<number>();
    while (visited.size < options.length) {
      nextIndex = (nextIndex + offset + options.length) % options.length;
      visited.add(nextIndex);
      if (!options[nextIndex]?.option.disabled) {
        this.activeIndex.set(nextIndex);
        return;
      }
    }
  }

  private getInitialActiveIndex(): number {
    const selectedIndex = this.visibleOptions().findIndex(option =>
      this.isOptionSelected(option.option),
    );

    if (selectedIndex > -1 && !this.visibleOptions()[selectedIndex]?.option.disabled) {
      return selectedIndex;
    }

    return this.getFirstEnabledIndex();
  }

  private getFirstEnabledIndex(): number {
    return this.visibleOptions().findIndex(option => !option.option.disabled);
  }

  private getLastEnabledIndex(): number {
    const options = this.visibleOptions();
    for (let index = options.length - 1; index >= 0; index -= 1) {
      if (!options[index]?.option.disabled) {
        return index;
      }
    }

    return -1;
  }

  private optionMatches(option: ZardComboboxOption, searchTerm: string): boolean {
    if (!searchTerm) {
      return true;
    }

    const filterWith = this.zFilterWith();
    if (filterWith) {
      return filterWith(option, searchTerm);
    }

    const normalized = searchTerm.toLowerCase();
    const haystacks = [
      option.label,
      this.resolveDisplayValue(option, option.value),
      this.getValueLabel(option.value),
      ...(option.keywords ?? []),
    ]
      .filter(Boolean)
      .map(value => `${value}`.toLowerCase());

    return haystacks.some(value => value.includes(normalized));
  }

  private resolveDisplayValue(
    option: ZardComboboxOption | null,
    value: ZardComboboxValue | null | undefined,
  ): string {
    if (value === null || value === undefined) {
      return '';
    }

    const displayWith = this.zDisplayWith();
    if (displayWith) {
      return displayWith(option, value) ?? '';
    }

    if (option?.label) {
      return option.label;
    }

    return this.getValueLabel(value);
  }

  private compareValues(
    a: ZardComboboxValue | null | undefined,
    b: ZardComboboxValue | null | undefined,
  ): boolean {
    const compareWith = this.zCompareWith();
    if (compareWith) {
      return compareWith((a ?? null) as ZardComboboxValue | null, (b ?? null) as ZardComboboxValue | null);
    }

    if (Object.is(a, b)) {
      return true;
    }

    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') {
      return false;
    }

    const left = a as Record<string, unknown>;
    const right = b as Record<string, unknown>;
    for (const key of ['id', 'key', 'value']) {
      if (key in left && key in right && Object.is(left[key], right[key])) {
        return true;
      }
    }

    return false;
  }

  private getGroupId(group: ZardComboboxGroup, groupIndex: number): string {
    if (group.id !== undefined && group.id !== null) {
      return `${this.listboxId}-group-${group.id}`;
    }

    return `${this.listboxId}-group-${group.label ?? groupIndex}`;
  }

  private getOptionId(option: ZardComboboxOption, optionIndex: number): string {
    if (option.id !== undefined && option.id !== null) {
      return `${this.listboxId}-option-${option.id}`;
    }

    const value = option.value;
    if (typeof value === 'string' || typeof value === 'number') {
      return `${this.listboxId}-option-${value}`;
    }

    if (value && typeof value === 'object') {
      const candidate = value as Record<string, unknown>;
      if (typeof candidate['id'] === 'string' || typeof candidate['id'] === 'number') {
        return `${this.listboxId}-option-${candidate['id']}`;
      }
      if (typeof candidate['key'] === 'string' || typeof candidate['key'] === 'number') {
        return `${this.listboxId}-option-${candidate['key']}`;
      }
    }

    return `${this.listboxId}-option-${optionIndex}`;
  }
}
