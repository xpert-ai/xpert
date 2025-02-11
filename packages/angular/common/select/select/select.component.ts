import { SelectionModel } from '@angular/cdk/collections'
import { ScrollingModule } from '@angular/cdk/scrolling'
import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  ContentChild,
  ElementRef,
  HostBinding,
  TemplateRef,
  booleanAttribute,
  computed,
  effect,
  forwardRef,
  input,
  signal,
  viewChild
} from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import {
  ControlValueAccessor,
  FormControl,
  FormsModule,
  NG_VALUE_ACCESSOR,
  ReactiveFormsModule,
  ValidatorFn
} from '@angular/forms'
import { MatAutocompleteModule } from '@angular/material/autocomplete'
import { MatIconModule } from '@angular/material/icon'
import { MatInputModule } from '@angular/material/input'
import { MatSelectModule } from '@angular/material/select'
import { DisplayDensity, ISelectOption, NgmDensityDirective, OcapCoreModule } from '@metad/ocap-angular/core'
import { DisplayBehaviour, isNil, nonNullable } from '@metad/ocap-core'
import { distinctUntilChanged, filter } from 'rxjs/operators'
import { NgmDisplayBehaviourComponent } from '../../display-behaviour'
import { NgmOptionContent } from '../../input/option-content'

@Component({
  standalone: true,
  selector: 'ngm-select',
  templateUrl: `select.component.html`,
  styleUrls: [`select.component.scss`],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'ngm-select',
    '[attr.disabled]': 'isDisabled || null'
  },
  hostDirectives: [
    {
      directive: NgmDensityDirective,
      inputs: ['small', 'large'],
    }
  ],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      multi: true,
      useExisting: forwardRef(() => NgmSelectComponent)
    }
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatSelectModule,
    MatAutocompleteModule,
    MatInputModule,
    MatIconModule,
    ScrollingModule,

    OcapCoreModule,
    NgmDisplayBehaviourComponent,
  ]
})
export class NgmSelectComponent implements ControlValueAccessor
{
  readonly displayBehaviour = input<DisplayBehaviour | string>()
  readonly displayDensity = input<DisplayDensity | string>()
  /**
   * The name of key field of option 
  */
 readonly valueKey = input<'value' | 'key' | string>('value')
 readonly label = input<string>()
 readonly placeholder = input<string>()

  readonly searchable = input<boolean, string | boolean>(false, {
    transform: booleanAttribute
  })
  readonly virtualScroll = input<boolean, string | boolean>(false, {
    transform: booleanAttribute
  })

  // readonly validators = input<ValidatorFn | ValidatorFn[] | null>()

  readonly multiple = input<boolean, string | boolean>(false, {
    transform: booleanAttribute
  })

  readonly selectOptions = input<Array<ISelectOption>>()
  readonly panelWidth = input<string | number | null>(null)
  readonly allowInput = input<boolean, string | boolean>(false, {
    transform: booleanAttribute
  })

  @ContentChild(NgmOptionContent, { read: TemplateRef, static: true })
  _explicitContent: TemplateRef<any> = undefined!
  readonly searInput = viewChild('searInput', { read: ElementRef })

  formControl = new FormControl<string>(null)
  readonly value = signal<string | number>(null)

  selection = new SelectionModel<string>(true)
  searchControl = new FormControl<string>(null)
  readonly highlight = toSignal(this.searchControl.valueChanges, { initialValue: '' })

  readonly options$ = computed(() => {
    const text = this.highlight()?.trim().toLowerCase()
    if (text) {
      const terms = text.split(' ').filter((t) => !!t)
      return this.selectOptions()?.filter((option) => {
        const str = `${option.caption || option.label || ''}${option[this.valueKey()]}`
        return terms.every((term) => str?.toLowerCase().includes(term))
      })
    }
    return this.selectOptions()
  })

  public selectTrigger = computed(() => {
    return this.selectOptions()?.find((option) => option[this.valueKey()] === this.value())
  })

  readonly autoInput = signal(null)

  readonly inputDirty = signal(false)

  onChange: (input: any) => void
  onTouched: () => void

  private valueSub = this.formControl.valueChanges
    .pipe(
      filter(() => !this.multiple()),
      distinctUntilChanged(),
      filter((value) => this.value() !== value),
      takeUntilDestroyed()
    )
    .subscribe((value) => {
      this.value.set(value)
      this.onChange?.(value)
    })

  private selectionSub = this.selection.changed
    .pipe(
      filter(() => this.multiple()),
      takeUntilDestroyed()
    )
    .subscribe(() => {
      this.onChange?.(this.selection.selected)
    })

  constructor() {
    effect(() => {
      if (!isNil(this.value())) {
        const selectedOption = this.selectOptions()?.find((item) => item[this.valueKey()] === this.value())
        if (nonNullable(selectedOption?.[this.valueKey()])) {
          this.autoInput.set(selectedOption)
        } else {
          this.autoInput.set(this.allowInput() ? this.value() : null)
        }
      } else {
        this.autoInput.set(null)
      }
    }, { allowSignalWrites: true })
  }

  writeValue(obj: any): void {
    // this.formControl.setValue(obj, {emitEvent: false}) // 不发出去会导致 formControl.valueChanges distinctUntilChanged 检测不到本次变化
    this.value.set(obj)
    this.formControl.setValue(obj)
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
  trackByValue(index: number, item) {
    return item?.key
  }

  displayWith(option: ISelectOption) {
    return option?.caption || option?.label || option?.key || option as string
  }

  onAutoInput(event: any) {
    if (typeof event === 'string') {
      this.searchControl.setValue(event)
    } else {
      this.formControl.setValue(event?.[this.valueKey()])
      this.searchControl.setValue(null)
    }
  }

  onOptionSelected(event: any) {
    this.inputDirty.set(false)
    // this.autoInput.set(event.option.value)
    this.searchControl.setValue(null)
    // this.searInput().nativeElement.value = null
  }

  onKeydown(event: KeyboardEvent) {
    this.inputDirty.set(true)
  }

  onBlur(event: FocusEvent) {
    if (!this.allowInput()) {
      return
    }
    const value = (<HTMLInputElement>event.target).value.trim()
    if (this.inputDirty()) {
      this.formControl.setValue(value)
      this.searchControl.setValue(null)
    }
  }

  clear() {
    this.formControl.setValue(null)
  }

  @HostBinding('attr.disabled')
  get isDisabled() {
    return this.formControl.disabled
  }
}
