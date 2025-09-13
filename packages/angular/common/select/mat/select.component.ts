import { coerceBooleanProperty } from '@angular/cdk/coercion'
import { ScrollingModule } from '@angular/cdk/scrolling'
import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  forwardRef,
  HostBinding,
  inject,
  input,
  Input,
  OnChanges,
  OnInit,
  signal,
  SimpleChanges
} from '@angular/core'
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop'
import {
  ControlValueAccessor,
  FormControl,
  FormsModule,
  NG_VALUE_ACCESSOR,
  ReactiveFormsModule,
  ValidatorFn
} from '@angular/forms'
import { MatAutocompleteModule } from '@angular/material/autocomplete'
import { MatButtonModule } from '@angular/material/button'
import { MatCheckboxChange, MatCheckboxModule } from '@angular/material/checkbox'
import { MatFormFieldAppearance, MatFormFieldModule } from '@angular/material/form-field'
import { MatIconModule } from '@angular/material/icon'
import { MatInputModule } from '@angular/material/input'
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'
import { DisplayDensity, ISelectOption, OcapCoreModule } from '@metad/ocap-angular/core'
import { DisplayBehaviour } from '@metad/ocap-core'
import { combineLatestWith, debounceTime, distinctUntilChanged, filter, map, startWith } from 'rxjs/operators'
import { NgmDisplayBehaviourComponent } from '../../display-behaviour'
import { isEqual } from 'lodash-es'

/**
 * @deprecated use headless components instead
 */
@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'ngm-mat-select',
  templateUrl: 'select.component.html',
  styleUrls: ['select.component.scss'],
  inputs: ['disabled', 'disableRipple', 'color'],
  host: {
    '[attr.disabled]': 'disabled || null'
  },
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      multi: true,
      useExisting: forwardRef(() => NgmMatSelectComponent)
    }
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,

    ScrollingModule,
    MatFormFieldModule,
    MatAutocompleteModule,
    MatCheckboxModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatInputModule,
    MatButtonModule,
    NgmDisplayBehaviourComponent,
    OcapCoreModule
  ]
})
export class NgmMatSelectComponent implements OnInit, OnChanges, ControlValueAccessor {
  readonly #destroyRef = inject(DestroyRef)

  @HostBinding('class.ngm-mat-select') _isSelectComponent = true

  @Input() appearance: MatFormFieldAppearance
  @Input() displayBehaviour: DisplayBehaviour | string
  @Input() displayDensity: DisplayDensity | string
  @Input() label: string
  @Input() placeholder: string

  @Input() validators: ValidatorFn | ValidatorFn[] | null

  // @Input() get selectOptions(): ISelectOption[] {
  //   return this._selectOptions$.value
  // }
  // set selectOptions(value) {
  //   this._selectOptions$.next(value)
  // }
  // private _selectOptions$ = new BehaviorSubject<ISelectOption[]>([])

  readonly selectOptions = input<ISelectOption[]>([])

  @Input() get multiple(): boolean {
    return this._multiple
  }
  set multiple(value: boolean | string) {
    this._multiple = coerceBooleanProperty(value)
  }
  private _multiple = false

  @Input() get virtualScroll() {
    return this._virtualScroll
  }
  set virtualScroll(value: boolean | string) {
    this._virtualScroll = coerceBooleanProperty(value)
  }
  private _virtualScroll = false

  readonly loading = input(false)

  virtualScrollItemSize = 48

  formControl = new FormControl<ISelectOption | string[] | string>(null)
  // selection = new SelectionModel<string>(true)
  readonly selectionSignal = selectionModel<string>()
  readonly selectedValues = computed(() => this.selectionSignal(), { equal: isEqual})
  get highlight() {
    return typeof this.formControl.value === 'string' ? this.formControl.value.trim() : null
  }
  get isNotInitial() {
    return Array.isArray(this.formControl.value) ? this.formControl.value.length : this.formControl.value
  }

  readonly _selectOptions$ = toObservable(this.selectOptions)
  public readonly options$ = this.formControl.valueChanges.pipe(
    startWith(''),
    debounceTime(500),
    combineLatestWith(this._selectOptions$),
    map(([name, options]) => {
      const text = Array.isArray(name) ? null : typeof name === 'string' ? name?.trim().toLowerCase() : null
      return options?.filter((option) =>
        text ? option.caption?.toLowerCase().includes(text) || `${option.key}`.toLowerCase().includes(text) : true
      )
    })
  )

  onChange: (input: any) => void
  onTouched: () => void

  constructor() {
    effect(() => {
      if (this.multiple) {
        // this._updateLabel()
        this.onChange?.(this.selectedValues())
      }
    }, { allowSignalWrites: true })
  }

  ngOnInit() {
    this.formControl.valueChanges
      .pipe(
        filter(() => !this.multiple),
        distinctUntilChanged(),
        takeUntilDestroyed(this.#destroyRef)
      )
      .subscribe((value) => {
        if (typeof value !== 'string' && !Array.isArray(value)) {
          this.onChange?.(value?.key)
        }
      })

    // this.selection.changed
    //   .pipe(
    //     filter(() => this.multiple),
    //     takeUntilDestroyed(this.#destroyRef)
    //   )
    //   .subscribe(() => {
    //     this._updateLabel()
    //     this.onChange?.(this.selection.selected)
    //   })

    this._selectOptions$.pipe(takeUntilDestroyed(this.#destroyRef)).subscribe(() => {
      this._updateLabel()
    })
  }

  ngOnChanges({ displayDensity, validators }: SimpleChanges): void {
    if (displayDensity) {
      if (this.displayDensity === DisplayDensity.compact) {
        this.virtualScrollItemSize = 30
      } else if (this.displayDensity === DisplayDensity.cosy) {
        this.virtualScrollItemSize = 36
      } else {
        this.virtualScrollItemSize = 48
      }
    }

    if (validators) {
      this.formControl.setValidators(validators.currentValue)
    }
  }

  writeValue(obj: any): void {
    if (obj) {
      if (this.multiple) {
        this.selectionSignal.set(obj)
        // this.selection.select(...obj)
      } else {
        this.formControl.setValue({ key: obj }, { emitEvent: false })
      }
      this._updateLabel()
    }
  }
  registerOnChange(fn: any): void {
    this.onChange = fn
  }
  registerOnTouched(fn: any) {
    this.onTouched = fn
  }
  setDisabledState?(isDisabled: boolean): void {
    isDisabled ? this.formControl.disable() : this.formControl.enable()
  }

  trackBy(i: number, item: ISelectOption) {
    return item.key || item.value
  }

  displayWith(value: any) {
    return Array.isArray(value) ? value : value?.caption || value?.key
  }

  private _updateLabel() {
    if (this.multiple) {
      this.formControl.setValue(
        // this.selection.selected.map((value) => this.selectOptions?.find((item) => item.key === value)?.caption || value)
        this.selectionSignal().map((value) => this.selectOptions()?.find((item) => item.key === value)?.caption || value)
      )
    } else {
      let option: any = this.formControl.value
      // if (isObject(option)) {
      const key = option?.key
      if (key && !option.caption) {
        option = {
          key,
          caption: this.selectOptions()?.find((item) => item.key === key)?.caption
        }
        this.formControl.setValue(option, { emitEvent: false })
      }
      // }
    }
  }

  isSelect(option: ISelectOption) {
    // return this.selection.isSelected(option?.key as string)
    return this.selectionSignal().includes(option.key)
  }

  onSelect(event: MatCheckboxChange, option: ISelectOption) {
    if (this.multiple) {
      if (event.checked) {
        // this.selection.select(option.key as string)
        // this.value.update((value) => [...(value ?? []), option.key])
        this.selectionSignal.select(option.key)
      } else {
        // this.selection.deselect(option.key as string)
        this.selectionSignal.deselect(option.key)
      }
    }
  }

  clear() {
    this.formControl.setValue(null)
    this.selectionSignal.clear()
  }

  getErrorMessage() {
    return Object.values(this.formControl.errors).join(', ')
  }
}

export function selectionModel<T>() {
  const m = signal<T[]>([])  // multiple ? : signal<T>(null)
  const sig = (): T[] => {
    return m()
  }
  sig.set = (value: T[]) => {
    m.set(value)
  }

  sig.update = (fn: (value: T[]) => T[]) => {
    m.update(fn)
  }

  sig.select = (value: T) => {
    m.update((values) => [...values, value])
  }

  sig.deselect = (value: T) => {
    m.update((values) => values.filter((v) => v !== value))
  }

  sig.clear = () => {
    m.set([])
  }

  return sig
}
