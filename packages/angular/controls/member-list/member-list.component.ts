import { CdkListboxModule, ListboxValueChangeEvent } from '@angular/cdk/listbox'
import { ScrollingModule } from '@angular/cdk/scrolling'
import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  EventEmitter,
  forwardRef,
  HostBinding,
  inject,
  Input,
  OnChanges,
  Output,
  signal,
  SimpleChanges
} from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { ControlValueAccessor, FormControl, NG_VALUE_ACCESSOR } from '@angular/forms'
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { DisplayDensity, mergeSelectedValues, NgmAppearance, OcapCoreModule } from '@metad/ocap-angular/core'
import {
  DataSettings,
  Dimension,
  DisplayBehaviour,
  FilterSelectionType,
  IMember,
  isEmpty,
  ISlicer
} from '@metad/ocap-core'
import { BehaviorSubject } from 'rxjs'
import { combineLatestWith, debounceTime, map, startWith, tap } from 'rxjs/operators'
import { NgmSmartFilterService } from '../smart-filter.service'
import { ControlOptions } from '../types'

export interface MemberListOptions extends ControlOptions {
  /**
   * Hiden radio indicator for signle selection
   */
  hideSingleSelectionIndicator?: boolean
}

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'ngm-member-list',
  templateUrl: 'member-list.component.html',
  styleUrls: ['member-list.component.scss'],
  providers: [
    NgmSmartFilterService,
    {
      provide: NG_VALUE_ACCESSOR,
      multi: true,
      useExisting: forwardRef(() => NgmMemberListComponent)
    }
  ],
  imports: [
    CommonModule,
    ScrollingModule,
    CdkListboxModule,
    MatProgressSpinnerModule,
    NgmCommonModule,
    OcapCoreModule,
  ]
})
export class NgmMemberListComponent implements OnChanges, ControlValueAccessor {
  @HostBinding('class.ngm-member-list') _isMemberListComponent = true

  private readonly smartFilterService = inject(NgmSmartFilterService)

  @Input() dataSettings: DataSettings
  private _dimension = signal<Dimension>(null)
  @Input() get dimension(): Dimension {
    return this._dimension()
  }
  set dimension(value: Dimension) {
    this._dimension.set(value)
  }

  private _options = signal<MemberListOptions>(null)
  @Input() get options(): MemberListOptions {
    return this._options()
  }
  set options(value: MemberListOptions) {
    this._options.set(value)
  }

  @Input() appearance: NgmAppearance
  @Input() disabled: boolean

  @Output() loadingChanging = new EventEmitter<boolean>()

  itemSize = 48

  searchControl = new FormControl()

  get displayBehaviour() {
    return this.dimension?.displayBehaviour
  }

  public readonly multiple = computed(() => this.options?.multiple ?? this.options?.selectionType === FilterSelectionType.Multiple)
  public readonly hideSingleSelectionIndicator = computed(() => this.options?.hideSingleSelectionIndicator)

  private slicer$ = new BehaviorSubject<ISlicer>(null)
  get members() {
    return this.slicer$.value?.members
  }

  public readonly loading$ = this.smartFilterService.loading$
  // Select options filtered by search text
  public readonly selectOptions = toSignal(
    this.smartFilterService.selectOptions$.pipe(
      tap((members) => {
        // Active first option when members initial loaded
        if (this.options?.autoActiveFirst && members?.[0] && isEmpty(this.slicer$.value?.members)) {
          this.slicer$.next({
            ...(this.slicer$.value ?? {}),
            members: [members[0]]
          })
        }
      }),
      combineLatestWith(
        this.searchControl.valueChanges.pipe(
          debounceTime(300),
          map((text) => (text ? `${text}`.toLowerCase() : text)),
          startWith(null)
        )
      ),
      map(([selectOptions, text]) => {
        // 除 DescriptionOnly 外才需要考虑使用 member id 进行过滤, 因为 member id 中往往含有父级相关信息
        const considerValue = this.displayBehaviour !== DisplayBehaviour.descriptionOnly
        return (
          (text
            ? selectOptions?.filter(
                (option) =>
                  option.caption?.toLowerCase().includes(text) ||
                  (considerValue && `${option.value}`.toLowerCase().includes(text))
              )
            : selectOptions) ?? []
        )
      })
    ),
    { initialValue: [] }
  )
  readonly listboxOptions = computed(() => mergeSelectedValues(this.selectOptions(), this.members ?? [], this.compareWith))

  onChange: (input: any) => void
  //
  private loadingSub = this.smartFilterService.loading$.pipe(takeUntilDestroyed()).subscribe((loading) => {
    this.loadingChanging.emit(loading)
  })
  private serviceSub = this.smartFilterService.onAfterServiceInit().pipe(takeUntilDestroyed()).subscribe(() => {
    this.smartFilterService.refresh()
  })
  private slicerSub = this.slicer$.pipe(takeUntilDestroyed()).subscribe((slicer) => {
    this.onChange?.({
      ...slicer,
      dimension: this.dimension
    })
  })

  constructor() {
    effect(() => {
      this.smartFilterService.options = { ...(this.options ?? {}), dimension: this.dimension }
    })

    effect(() => {
      if (this.options?.defaultMembers) {
        this.slicer$.next({
          ...(this.slicer$.value ?? {}),
          members: [...this.options.defaultMembers]
        })
      }
    })
  }

  ngOnChanges({ dataSettings, appearance }: SimpleChanges): void {
    if (dataSettings?.currentValue) {
      this.smartFilterService.dataSettings = dataSettings.currentValue
    }

    if (appearance?.currentValue) {
      switch (this.appearance.displayDensity) {
        case DisplayDensity.compact:
          this.itemSize = 30
          break
        case DisplayDensity.cosy:
          this.itemSize = 40
          break
        default:
          this.itemSize = 48
      }
    }
  }

  writeValue(obj: any): void {
    if (obj) {
      this.slicer$.next({ ...obj })
    }
  }
  registerOnChange(fn: any): void {
    this.onChange = fn
    if (this.slicer$.value) {
      this.onChange(this.slicer$.value)
    }
  }
  registerOnTouched(fn: any): void {
    //
  }
  setDisabledState?(isDisabled: boolean): void {
    this.disabled = isDisabled
    isDisabled ? this.searchControl.disable() : this.searchControl.enable()
  }

  clearSearch(event) {
    event.stopPropagation()
    this.searchControl.setValue('')
  }

  compareWith(a: IMember, b: IMember) {
    return a.value === b.value
  }

  trackByValue(index: number, item: IMember) {
    return item?.value ?? item?.key ?? index
  }

  onSelectionChange(selection: ListboxValueChangeEvent<IMember>) {
    const members = selection.value.map((item) => ({
      ...item
    }))

    this.slicer$.next({
      ...(this.slicer$.value ?? {}),
      members
    })

    this.onChange?.(this.slicer$.value)
  }

  isSelected(option: IMember) {
    return this.members?.findIndex((member) => member.value === option.value) > -1
  }
}
