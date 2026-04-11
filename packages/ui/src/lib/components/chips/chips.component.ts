/* eslint-disable @angular-eslint/no-input-rename */
/* eslint-disable @angular-eslint/no-output-native */

import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChildren,
  Directive,
  ElementRef,
  forwardRef,
  inject,
  InjectionToken,
  input,
  output,
  signal,
  type Signal,
  ViewEncapsulation
} from '@angular/core'
import { NG_VALUE_ACCESSOR, type ControlValueAccessor } from '@angular/forms'

import type { ClassValue } from 'clsx'

import { injectUiI18nService } from '../../core/i18n/ui-i18n.service'
import { mergeClasses, noopFn } from '../../utils/merge-classes'
import {
  chipAvatarVariants,
  chipContainerVariants,
  chipContentVariants,
  chipRemoveVariants,
  chipVariants,
  type ZardChipColor,
  type ZardChipDisplayDensity
} from './chips.variants'

const booleanOrNullAttribute = (value: unknown): boolean | null => {
  if (value === null || value === undefined) {
    return null
  }

  return booleanAttribute(value)
}

const normalizeDensity = (value: unknown): ZardChipDisplayDensity => {
  return value === 'compact'
    ? 'compact'
    : value === 'cosy'
      ? 'cosy'
      : value === 'comfortable' || value === 'comfort' || value === 'default' || value == null
        ? 'default'
        : 'default'
}

const normalizeColor = (value: unknown): ZardChipColor => {
  return value === 'primary' || value === 'accent' || value === 'warn' || value === 'basic' ? value : 'default'
}

const normalizeOrientation = (value: unknown): 'horizontal' | 'vertical' => {
  return value === 'vertical' ? 'vertical' : 'horizontal'
}

type OnTouchedType = () => void
type OnChangeType = (value: unknown) => void

export interface ZardChipInputRef {
  clear(): void
}

export interface ZardChipInputEvent {
  value: string
  input: HTMLInputElement | HTMLTextAreaElement
  chipInput: ZardChipInputRef
}

interface ZardChipStyleContext {
  readonly color: Signal<string | null>
  readonly disabled: Signal<boolean>
  readonly displayDensity: Signal<ZardChipDisplayDensity>
}

interface ZardChipListboxApi {
  readonly selectable: Signal<boolean>
  readonly selectedValue: Signal<unknown>
  isSelected(value: unknown): boolean
  select(value: unknown): void
  touch(): void
}

interface ZardChipRemovableApi {
  readonly disabledState: Signal<boolean>
  remove(): void
}

export const ZARD_CHIP_STYLE_CONTEXT = new InjectionToken<ZardChipStyleContext>('ZARD_CHIP_STYLE_CONTEXT')
export const ZARD_CHIP_LISTBOX = new InjectionToken<ZardChipListboxApi>('ZARD_CHIP_LISTBOX')
export const ZARD_CHIP_REMOVABLE = new InjectionToken<ZardChipRemovableApi>('ZARD_CHIP_REMOVABLE')

@Directive()
abstract class ZardChipContainerBaseComponent implements ZardChipStyleContext {
  readonly class = input<ClassValue>('')
  readonly displayDensityInput = input<unknown>(null, { alias: 'displayDensity' })
  readonly colorInput = input<string | null>(null, { alias: 'color' })
  readonly disabledInput = input(false, { alias: 'disabled', transform: booleanAttribute })
  protected readonly disabledByForm = signal(false)

  readonly displayDensity = computed(() => normalizeDensity(this.displayDensityInput()))
  readonly color = computed(() => this.colorInput())
  readonly disabled = computed(() => this.disabledInput() || this.disabledByForm())
}

@Component({
  selector: 'z-chip-set',
  standalone: true,
  template: '<ng-content />',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  providers: [
    {
      provide: ZARD_CHIP_STYLE_CONTEXT,
      useExisting: forwardRef(() => ZardChipSetComponent)
    }
  ],
  host: {
    '[class]': 'classes()',
    '[attr.data-color]': 'resolvedColor()',
    '[attr.data-density]': 'displayDensity()'
  },
  exportAs: 'zChipSet'
})
export class ZardChipSetComponent extends ZardChipContainerBaseComponent {
  protected readonly resolvedColor = computed(() => normalizeColor(this.color()))
  protected readonly classes = computed(() =>
    mergeClasses(chipContainerVariants({ orientation: 'horizontal' }), this.class())
  )
}

@Component({
  selector: 'z-chip-grid',
  standalone: true,
  template: `
    @if (showEmptyStateContent()) {
      <span
        aria-hidden="true"
        class="z-chip-grid__empty-state pointer-events-none inline-flex min-h-10 w-full items-center rounded-md bg-background-default-subtle px-3 py-2 text-sm italic leading-5 text-text-tertiary"
      >
        @if (showEmptyPlaceholder()) {
          {{ resolvedEmptyPlaceholder() }}
        }
      </span>
    }
    <ng-content />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  providers: [
    {
      provide: ZARD_CHIP_STYLE_CONTEXT,
      useExisting: forwardRef(() => ZardChipGridComponent)
    }
  ],
  host: {
    '[class]': 'classes()',
    '[attr.aria-label]': 'ariaLabel() || null',
    '[attr.data-color]': 'resolvedColor()',
    '[attr.data-density]': 'displayDensity()',
    '[attr.data-multiple]': 'multiple() ? "" : null',
    '[attr.role]': '"list"'
  },
  exportAs: 'zChipGrid'
})
export class ZardChipGridComponent extends ZardChipContainerBaseComponent {
  private readonly i18n = injectUiI18nService()

  readonly ariaLabel = input<string>('', { alias: 'aria-label' })
  readonly multiple = input(false, { transform: booleanAttribute })
  readonly showEmptyState = input(false, { transform: booleanAttribute })
  readonly showEmptyPlaceholder = input(true, { transform: booleanAttribute })
  readonly emptyPlaceholder = input<string | null>(null)
  readonly projectedChipRows = contentChildren(forwardRef(() => ZardChipRowComponent), { descendants: true })

  protected readonly resolvedColor = computed(() => normalizeColor(this.color()))
  protected readonly classes = computed(() =>
    mergeClasses(chipContainerVariants({ orientation: 'horizontal' }), this.class())
  )
  protected readonly resolvedEmptyPlaceholder = computed(() =>
    this.emptyPlaceholder() ||
    this.i18n.t('chipGrid.emptyPlaceholder', {
      Default: 'Select or add items'
    })
  )
  protected readonly showEmptyStateContent = computed(
    () => this.showEmptyState() && this.projectedChipRows().length === 0
  )
}

export interface ZardChipListboxChange<T = unknown> {
  value: T
}

@Component({
  selector: 'z-chip-listbox',
  standalone: true,
  template: '<ng-content />',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ZardChipListboxComponent),
      multi: true
    },
    {
      provide: ZARD_CHIP_STYLE_CONTEXT,
      useExisting: forwardRef(() => ZardChipListboxComponent)
    },
    {
      provide: ZARD_CHIP_LISTBOX,
      useExisting: forwardRef(() => ZardChipListboxComponent)
    }
  ],
  host: {
    '[class]': 'classes()',
    '[attr.aria-disabled]': 'disabled() ? "true" : null',
    '[attr.aria-orientation]': 'orientation()',
    '[attr.data-color]': 'resolvedColor()',
    '[attr.data-density]': 'displayDensity()',
    '[attr.data-selectable]': 'selectable() ? "" : null',
    '[attr.role]': '"listbox"'
  },
  exportAs: 'zChipListbox'
})
export class ZardChipListboxComponent extends ZardChipContainerBaseComponent implements ControlValueAccessor, ZardChipListboxApi {
  readonly selectionChange = output<ZardChipListboxChange>()
  readonly valueChange = output<unknown>()

  readonly ariaLabel = input<string>('', { alias: 'aria-label' })
  readonly hideSingleSelectionIndicator = input(false, { transform: booleanAttribute })
  readonly required = input(false, { transform: booleanAttribute })
  readonly selectable = input(true, { transform: booleanAttribute })
  readonly orientationInput = input<unknown>('horizontal', { alias: 'aria-orientation' })

  readonly selectedValue = signal<unknown>(null)

  private onChange: OnChangeType = noopFn
  private onTouched: OnTouchedType = noopFn

  protected readonly orientation = computed(() => normalizeOrientation(this.orientationInput()))
  protected readonly resolvedColor = computed(() => normalizeColor(this.color()))
  protected readonly classes = computed(() =>
    mergeClasses(chipContainerVariants({ orientation: this.orientation() }), this.class())
  )

  writeValue(value: unknown): void {
    this.selectedValue.set(value)
  }

  registerOnChange(fn: OnChangeType): void {
    this.onChange = fn
  }

  registerOnTouched(fn: OnTouchedType): void {
    this.onTouched = fn
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabledByForm.set(isDisabled)
  }

  isSelected(value: unknown): boolean {
    return Object.is(this.selectedValue(), value)
  }

  select(value: unknown): void {
    if (!this.selectable() || this.disabled() || this.isSelected(value)) {
      return
    }

    this.selectedValue.set(value)
    this.onChange(value)
    this.valueChange.emit(value)
    this.selectionChange.emit({ value })
  }

  touch(): void {
    this.onTouched()
  }
}

@Directive()
abstract class ZardBaseChipComponent {
  protected readonly styleContext = inject(ZARD_CHIP_STYLE_CONTEXT, { optional: true })

  readonly class = input<ClassValue>('')
  readonly colorInput = input<string | null>(null, { alias: 'color' })
  readonly disabledInput = input(false, { alias: 'disabled', transform: booleanAttribute })
  readonly highlighted = input(false, { transform: booleanAttribute })

  protected readonly resolvedColor = computed<ZardChipColor>(() => normalizeColor(this.colorInput() ?? this.styleContext?.color()))
  protected readonly disabled = computed(() => this.disabledInput() || (this.styleContext?.disabled() ?? false))
  protected readonly displayDensity = computed(() => normalizeDensity(this.styleContext?.displayDensity()))
  protected readonly contentClasses = computed(() => chipContentVariants())
}

@Component({
  selector: 'z-chip',
  standalone: true,
  template: `
    <ng-content select="[zChipAvatar]"></ng-content>
    <span [class]="contentClasses()">
      <ng-content></ng-content>
    </span>
    <ng-content select="[zChipRemove]"></ng-content>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'classes()',
    '[attr.data-color]': 'resolvedColor()',
    '[attr.data-density]': 'displayDensity()',
    '[attr.data-disabled]': 'disabled() ? "" : null',
    '[attr.data-highlighted]': 'highlighted() ? "" : null',
    '[attr.data-selected]': 'selected() ? "" : null'
  },
  exportAs: 'zChip'
})
export class ZardChipComponent extends ZardBaseChipComponent {
  readonly selected = input(false, { transform: booleanAttribute })

  protected readonly classes = computed(() =>
    mergeClasses(
      chipVariants({
        kind: 'default',
        color: this.resolvedColor(),
        displayDensity: this.displayDensity(),
        disabled: this.disabled(),
        highlighted: this.highlighted(),
        selected: this.selected(),
        interactive: false
      }),
      this.class()
    )
  )
}

@Component({
  selector: 'z-chip-row',
  standalone: true,
  template: `
    <ng-content select="[zChipAvatar]"></ng-content>
    <span [class]="contentClasses()">
      <ng-content></ng-content>
    </span>
    <ng-content select="[zChipRemove]"></ng-content>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  providers: [
    {
      provide: ZARD_CHIP_REMOVABLE,
      useExisting: forwardRef(() => ZardChipRowComponent)
    }
  ],
  host: {
    '[class]': 'classes()',
    '[attr.data-color]': 'resolvedColor()',
    '[attr.data-density]': 'displayDensity()',
    '[attr.data-disabled]': 'disabled() ? "" : null',
    '[attr.data-highlighted]': 'highlighted() ? "" : null',
    '[attr.data-removable]': 'removable() ? "" : null',
    '[attr.data-selected]': 'selected() ? "" : null'
  },
  exportAs: 'zChipRow'
})
export class ZardChipRowComponent extends ZardBaseChipComponent implements ZardChipRemovableApi {
  readonly removed = output<void>()
  readonly removable = input(true, { transform: booleanAttribute })
  readonly selected = input(false, { transform: booleanAttribute })
  readonly value = input<unknown>(null)
  readonly disabledState = computed(() => this.disabled())

  protected readonly classes = computed(() =>
    mergeClasses(
      chipVariants({
        kind: 'row',
        color: this.resolvedColor(),
        displayDensity: this.displayDensity(),
        disabled: this.disabled(),
        highlighted: this.highlighted(),
        selected: this.selected(),
        interactive: false
      }),
      this.class()
    )
  )

  remove(): void {
    if (!this.removable() || this.disabled()) {
      return
    }

    this.removed.emit()
  }
}

@Component({
  selector: 'z-chip-option',
  standalone: true,
  template: `
    <ng-content select="[zChipAvatar]"></ng-content>
    <span [class]="contentClasses()">
      <ng-content></ng-content>
    </span>
    <ng-content select="[zChipRemove]"></ng-content>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  providers: [
    {
      provide: ZARD_CHIP_REMOVABLE,
      useExisting: forwardRef(() => ZardChipOptionComponent)
    }
  ],
  host: {
    '[class]': 'classes()',
    '[attr.aria-disabled]': 'disabled() ? "true" : null',
    '[attr.aria-selected]': 'resolvedSelected() ? "true" : "false"',
    '[attr.data-color]': 'resolvedColor()',
    '[attr.data-density]': 'displayDensity()',
    '[attr.data-disabled]': 'disabled() ? "" : null',
    '[attr.data-highlighted]': 'highlighted() ? "" : null',
    '[attr.data-removable]': 'removable() ? "" : null',
    '[attr.data-selected]': 'resolvedSelected() ? "" : null',
    '[attr.data-selectable]': 'resolvedSelectable() ? "" : null',
    '[attr.role]': '"option"',
    '[attr.tabindex]': 'disabled() ? -1 : 0',
    '(blur)': 'onBlur()',
    '(click)': 'onClick()',
    '(keydown)': 'onKeydown($event)'
  },
  exportAs: 'zChipOption'
})
export class ZardChipOptionComponent extends ZardBaseChipComponent implements ZardChipRemovableApi {
  private readonly listbox = inject(ZARD_CHIP_LISTBOX, { optional: true })

  readonly removed = output<void>()
  readonly value = input<unknown>(null)
  readonly removable = input(true, { transform: booleanAttribute })
  readonly disabledState = computed(() => this.disabled())
  readonly selectableInput = input<boolean | null, boolean | string | null | undefined>(null, {
    alias: 'selectable',
    transform: booleanOrNullAttribute
  })
  readonly selectedInput = input<boolean | null, boolean | string | null | undefined>(null, {
    alias: 'selected',
    transform: booleanOrNullAttribute
  })

  protected readonly resolvedSelectable = computed(() => {
    if (this.selectableInput() !== null) {
      return this.selectableInput() as boolean
    }

    return this.listbox?.selectable() ?? false
  })

  protected readonly resolvedSelected = computed(() => {
    if (this.selectedInput() !== null) {
      return this.selectedInput() as boolean
    }

    return this.listbox?.isSelected(this.value()) ?? false
  })

  protected readonly classes = computed(() =>
    mergeClasses(
      chipVariants({
        kind: 'option',
        color: this.resolvedColor(),
        displayDensity: this.displayDensity(),
        disabled: this.disabled(),
        highlighted: this.highlighted(),
        selected: this.resolvedSelected(),
        interactive: this.resolvedSelectable()
      }),
      this.class()
    )
  )

  remove(): void {
    if (!this.removable() || this.disabled()) {
      return
    }

    this.removed.emit()
  }

  onBlur(): void {
    this.listbox?.touch()
  }

  onClick(): void {
    if (!this.resolvedSelectable() || this.disabled()) {
      return
    }

    this.listbox?.select(this.value())
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    if (!this.resolvedSelectable() || this.disabled()) {
      return
    }

    this.listbox?.select(this.value())
  }
}

@Directive({
  selector: '[zChipAvatar]',
  standalone: true,
  host: {
    '[attr.data-slot]': '"chip-avatar"',
    '[class]': 'classes()'
  }
})
export class ZardChipAvatarDirective {
  protected readonly classes = computed(() => chipAvatarVariants())
}

@Directive({
  selector: '[zChipRemove]',
  standalone: true,
  host: {
    '[attr.data-disabled]': 'disabled() ? "" : null',
    '[attr.data-slot]': '"chip-remove"',
    '[attr.role]': 'role()',
    '[attr.tabindex]': 'tabIndex()',
    '[attr.type]': 'buttonType()',
    '[class]': 'classes()',
    '(click)': 'onClick($event)',
    '(keydown)': 'onKeydown($event)'
  }
})
export class ZardChipRemoveDirective {
  private readonly elementRef = inject(ElementRef<HTMLElement>)
  private readonly removableChip = inject(ZARD_CHIP_REMOVABLE)
  private readonly styleContext = inject(ZARD_CHIP_STYLE_CONTEXT, { optional: true })

  protected readonly disabled = computed(() => this.removableChip.disabledState())
  protected readonly classes = computed(() =>
    chipRemoveVariants({
      displayDensity: normalizeDensity(this.styleContext?.displayDensity()),
      disabled: this.disabled()
    })
  )

  protected readonly role = computed(() => {
    return this.isButtonLike() ? null : 'button'
  })

  protected readonly tabIndex = computed(() => {
    return this.isButtonLike() ? null : this.disabled() ? -1 : 0
  })

  protected readonly buttonType = computed(() => {
    return this.elementRef.nativeElement.tagName === 'BUTTON' ? 'button' : null
  })

  onClick(event: Event): void {
    event.stopPropagation()
    event.preventDefault()

    if (this.disabled()) {
      return
    }

    this.removableChip.remove()
  }

  onKeydown(event: KeyboardEvent): void {
    if (this.isButtonLike() || (event.key !== 'Enter' && event.key !== ' ')) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    if (this.disabled()) {
      return
    }

    this.removableChip.remove()
  }

  private isButtonLike() {
    const tagName = this.elementRef.nativeElement.tagName
    return tagName === 'BUTTON' || tagName === 'A'
  }
}

@Directive({
  selector: 'input[zChipInputFor], textarea[zChipInputFor]',
  standalone: true,
  host: {
    class: 'z-chip-input min-w-[50px] flex-1 bg-transparent outline-none'
  },
  exportAs: 'zChipInput'
})
export class ZardChipInputDirective {
  readonly zChipInputFor = input<ZardChipGridComponent | null>(null)
  readonly zChipInputAddOnBlur = input(false, { transform: booleanAttribute })
  readonly zChipInputSeparatorKeyCodes = input<readonly number[]>([])
  readonly zChipInputTokenEnd = output<ZardChipInputEvent>()

  private readonly elementRef = inject(ElementRef<HTMLInputElement | HTMLTextAreaElement>)

  constructor() {
    const element = this.elementRef.nativeElement
    element.addEventListener('keydown', this.onKeydown)
    element.addEventListener('blur', this.onBlur)
  }

  private readonly onKeydown = (event: KeyboardEvent) => {
    if (event.isComposing || event.defaultPrevented || !this.isSeparator(event)) {
      return
    }

    if (event.key === 'Enter' && this.isAutocompleteExpanded()) {
      return
    }

    event.preventDefault()
    this.emitToken()
  }

  private readonly onBlur = () => {
    if (!this.zChipInputAddOnBlur()) {
      return
    }

    this.emitToken()
  }

  private emitToken() {
    const input = this.elementRef.nativeElement

    this.zChipInputTokenEnd.emit({
      value: input.value,
      input,
      chipInput: {
        clear: () => {
          input.value = ''
          input.dispatchEvent(new Event('input', { bubbles: true }))
        }
      }
    })
  }

  private isSeparator(event: KeyboardEvent) {
    const keyCode = event.keyCode || event.which
    return this.zChipInputSeparatorKeyCodes().includes(keyCode)
  }

  private isAutocompleteExpanded() {
    return this.elementRef.nativeElement.getAttribute('aria-expanded') === 'true'
  }
}

export const ZardChipsImports = [
  ZardChipSetComponent,
  ZardChipGridComponent,
  ZardChipListboxComponent,
  ZardChipComponent,
  ZardChipRowComponent,
  ZardChipOptionComponent,
  ZardChipAvatarDirective,
  ZardChipRemoveDirective,
  ZardChipInputDirective
] as const
