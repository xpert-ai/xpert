import { CommonModule } from '@angular/common'
import { Component, effect, EventEmitter, forwardRef, inject, input, Input, Output } from '@angular/core'
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop'
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms'
import { NgmAdvancedSelectComponent } from '@xpert-ai/ocap-angular/common'
import { AppearanceDirective, DensityDirective, NgmAppearance } from '@xpert-ai/ocap-angular/core'
import {
  DataSettings,
  Dimension,
  DisplayBehaviour,
  FilterSelectionType,
  getEntityProperty,
  IMember,
  isEmpty,
  isEqual,
  ISlicer,
  isNil
} from '@xpert-ai/ocap-core'
import {
  BehaviorSubject,
  combineLatest,
  combineLatestWith,
  distinctUntilChanged,
  firstValueFrom,
  map,
  of,
  shareReplay,
  switchMap,
  withLatestFrom
} from 'rxjs'
import { NgmSmartFilterService } from '../smart-filter.service'
import { ControlOptions } from '../types'
import { ZardButtonComponent, ZardFormImports, ZardIconComponent } from '@xpert-ai/headless-ui'

export interface SmartSelectOptions extends ControlOptions {
  /**
   * 用户自定义成员
   */
  data?: Array<IMember>
}

/**
 * @deprecated use NgmSmartFilter instand
 */
@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, ...ZardFormImports, ZardIconComponent, ZardButtonComponent, DensityDirective, AppearanceDirective, NgmAdvancedSelectComponent],
  selector: 'ngm-smart-select',
  templateUrl: 'smart-select.component.html',
  styleUrls: ['smart-select.component.scss'],
  host: {
    class: 'ngm-smart-select'
  },
  providers: [
    NgmSmartFilterService,
    {
      provide: NG_VALUE_ACCESSOR,
      multi: true,
      useExisting: forwardRef(() => NgmSmartSelectComponent)
    }
  ]
})
export class NgmSmartSelectComponent implements ControlValueAccessor {
  private smartFilterService = inject(NgmSmartFilterService)

  readonly dataSettings = input<DataSettings>()
  readonly dimension = input<Dimension>()
  readonly options = input<SmartSelectOptions>()
  private options$ = toObservable(this.options)

  @Input() appearance: NgmAppearance
  @Input() disabled: boolean

  @Output() loadingChanging = new EventEmitter<boolean>()

  get displayBehaviour() {
    return this.dimension()?.displayBehaviour ?? DisplayBehaviour.descriptionOnly
  }

  public readonly property$ = toObservable(this.dimension).pipe(
    combineLatestWith(this.smartFilterService.selectEntityType()),
    map(([dimension, entityType]) => getEntityProperty(entityType, dimension))
  )
  public readonly label$ = combineLatest([this.options$.pipe(map((options) => options?.label)), this.property$]).pipe(
    map(([label, property]) => label || property?.caption || property?.name)
  )
  public readonly placeholder$ = this.options$.pipe(map((options) => options?.placeholder))
  public readonly autoActiveFirst$ = this.options$.pipe(map((options) => options?.autoActiveFirst))
  public readonly multiple$ = this.options$.pipe(
    map((options) => options?.selectionType === FilterSelectionType.Multiple || options?.multiple),
    distinctUntilChanged()
  )

  public readonly slicer$ = new BehaviorSubject<ISlicer | null>(null)
  public readonly members$ = this.slicer$.pipe(map((slicer) => slicer?.members))
  public readonly memberValues$ = this.members$.pipe(
    withLatestFrom(this.multiple$),
    map(([members, multiple]) => (multiple ? members?.map(({ value }) => value) : members?.[0]?.value)),
    distinctUntilChanged(isEqual)
  )
  public readonly isInitial$ = this.members$.pipe(map((members) => isEmpty(members)))

  public readonly data$ = this.options$.pipe(map((options) => options?.data))
  public readonly selectOptions$ = this.data$.pipe(
    map((data) => data?.filter((item) => !!item)),
    switchMap((data) => (isEmpty(data) ? this.smartFilterService.selectOptions$ : of(data))),
    withLatestFrom(this.autoActiveFirst$, this.members$),
    map(([selectOptions, autoActiveFirst, members]) => {
      if (selectOptions[0] && autoActiveFirst && isEmpty(members)) {
        this.toggleMember(selectOptions[0])
      }
      return selectOptions
    }),
    takeUntilDestroyed(),
    shareReplay(1)
  )
  public readonly loading$ = this.smartFilterService.loading$

  onChange: (input: ISlicer) => any

  //
  private loadingSub = this.smartFilterService.loading$.pipe(takeUntilDestroyed()).subscribe((loading) => {
    this.loadingChanging.emit(loading)
  })
  private serviceSub = this.smartFilterService
    .onAfterServiceInit()
    .pipe(takeUntilDestroyed())
    .subscribe(() => {
      this.smartFilterService.refresh()
    })
  private slicerSub = this.slicer$.pipe(takeUntilDestroyed()).subscribe((slicer) => {
    this.onChange?.({
      ...slicer,
      dimension: this.dimension()
    })
  })

  constructor() {
    effect(() => {
      if (this.dataSettings()) {
        this.smartFilterService.dataSettings = this.dataSettings()
      }
    })

    effect(() => {
      this.smartFilterService.options = {
        ...(this.options() ?? {}),
        dimension: this.dimension()
      }
      console.log(this.options())
    })

    effect(
      () => {
        if (this.options()?.defaultMembers) {
          this.setMembers(this.options().defaultMembers)
        }
      }
    )
  }

  writeValue(obj: any): void {
    if (obj) {
      this.slicer$.next(obj)
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
  }

  toggleMember(member: IMember) {
    const slicer = this.slicer$.value ?? {
      dimension: this.dimension()
    }
    if (this.options()?.selectionType === FilterSelectionType.Multiple) {
      const index = slicer.members?.findIndex((item) => item.value === member.value)
      if (index > -1) {
        slicer.members.splice(index, 1)
      } else {
        slicer.members = slicer.members ?? []
        slicer.members.push({
          key: member.key,
          value: member.value,
          caption: member.caption
        })
      }
    } else {
      slicer.members = [
        {
          key: member.key,
          value: member.value,
          caption: member.caption
        }
      ]
    }

    this.slicer$.next(slicer)
    this.onChange?.(slicer)
  }

  async setSelectedValues(values: string[]) {
    const selectOptions = await firstValueFrom(this.selectOptions$)
    values = Array.isArray(values) ? values : isNil(values) ? null : [values]
    this.setMembers(values?.map((value) => selectOptions.find((item) => item.key === value) ?? { value, key: value }))
  }

  setMembers(members?: IMember[]) {
    const slicer = this.slicer$.value ?? {
      dimension: this.dimension()
    }
    slicer.members = [...(members ?? [])]
    this.slicer$.next(slicer)

    this.onChange?.(slicer)
  }
}
