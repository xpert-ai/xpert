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
  Output,
  signal
} from '@angular/core'
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop'
import { ControlValueAccessor, FormControl, FormsModule, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms'

import { NgmCommonModule } from '@xpert-ai/ocap-angular/common'
import { DisplayDensity, NgmAppearance, OcapCoreModule } from '@xpert-ai/ocap-angular/core'
import {
  DataSettings,
  Dimension,
  FilterSelectionType,
  getDimensionMemberCaption,
  getPropertyHierarchy,
  IDimensionMember,
  IMember,
  ISlicer
} from '@xpert-ai/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { isEmpty, isEqual } from 'lodash-es'
import { debounceTime, distinctUntilChanged, map } from 'rxjs/operators'
import { NgmSmartFilterService } from '../smart-filter.service'
import { ControlOptions } from '../types'
import { ZardCheckboxComponent, ZardIconComponent, ZardLoaderComponent, ZardTableImports } from '@xpert-ai/headless-ui'
import { normalizeTableSearchValue } from '../../common/table/table.utils'

export interface MemberTableOptions extends ControlOptions {
  label?: string
  placeholder?: string
  maxTagCount?: number
  autoActiveFirst?: boolean
  stickyHeader?: boolean
}

export interface MemberTableState {
  slicer: ISlicer
  options?: MemberTableOptions
}

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'ngm-member-table',
  templateUrl: 'member-table.component.html',
  styleUrls: ['member-table.component.scss'],
  providers: [
    NgmSmartFilterService,
    {
      provide: NG_VALUE_ACCESSOR,
      multi: true,
      useExisting: forwardRef(() => NgmMemberTableComponent)
    }
  ],
  imports: [
    CommonModule,
    TranslateModule,
    FormsModule,
    ReactiveFormsModule,
    ZardIconComponent,
    ZardCheckboxComponent,
    ZardLoaderComponent,
    ...ZardTableImports,
    OcapCoreModule,
    NgmCommonModule
  ]
})
export class NgmMemberTableComponent<T> implements ControlValueAccessor {
  @HostBinding('class.ngm-member-table') _isMemberTableComponent = true

  private smartFilterService = inject(NgmSmartFilterService)

  private _dataSettings = signal<DataSettings>(null)
  @Input() get dataSettings(): DataSettings {
    return this._dataSettings()
  }
  set dataSettings(value: DataSettings) {
    this._dataSettings.set(value)
  }

  private _dimension = signal<Dimension>(null)
  @Input() get dimension(): Dimension {
    return this._dimension()
  }
  set dimension(value: Dimension) {
    this._dimension.set(value)
  }

  private _options = signal<MemberTableOptions>(null)
  @Input() get options() {
    return this._options()
  }
  set options(value) {
    this._options.set(value)
  }

  private _appearance = signal<NgmAppearance>(null)
  @Input() get appearance(): NgmAppearance {
    return this._appearance()
  }
  set appearance(value: NgmAppearance) {
    this._appearance.set(value)
  }

  @Output() loadingChanging = new EventEmitter<boolean>()

  slicer = signal<ISlicer>(null)
  itemSize = 50
  searchControl = new FormControl()

  public readonly options$ = toObservable(this._options)
  public readonly selectionType$ = this.options$.pipe(map((options) => options?.selectionType))
  public readonly multiple$ = this.selectionType$.pipe(
    map((selectionType) => selectionType === FilterSelectionType.Multiple)
  )
  public readonly slicer$ = toObservable(this.slicer)

  public readonly results$ = this.smartFilterService.selectResult()
  public readonly results = toSignal(this.results$, { initialValue: null })
  public readonly schema$ = this.results$.pipe(map((result) => result?.schema))
  public readonly columns$ = this.schema$.pipe(map((schema) => [...(schema?.rows ?? []), ...(schema?.columns ?? [])]))
  public readonly columns = toSignal(this.columns$, { initialValue: [] as any[] })
  public readonly searchText = signal('')
  public readonly rows = computed(() => {
    const rows = (this.results()?.data as T[]) ?? []
    const text = this.searchText()

    if (!text) {
      return rows
    }

    return rows.filter((row) =>
      this.columns().some((column) => normalizeTableSearchValue(row?.[column.name]).includes(text))
    )
  })

  public readonly loading$ = this.smartFilterService.loading$

  onChange: (input: any) => void

  private loadingSub = this.smartFilterService.loading$.pipe(takeUntilDestroyed()).subscribe((loading) => {
    this.loadingChanging.emit(loading)
  })
  private serviceSub = this.smartFilterService
    .onAfterServiceInit()
    .pipe(takeUntilDestroyed())
    .subscribe(() => {
      this.smartFilterService.refresh()
    })
  private slicerSub = this.slicer$.pipe(distinctUntilChanged(isEqual), takeUntilDestroyed()).subscribe((slicer) => {
    this.onChange?.({
      ...slicer,
      dimension: this.dimension
    })
  })
  private searchSub = this.searchControl.valueChanges
    .pipe(debounceTime(500), takeUntilDestroyed())
    .subscribe((text) => {
      this.searchText.set(text?.trim().toLowerCase() ?? '')
    })
  constructor() {
    effect(() => {
      this.smartFilterService.options = { ...(this.options ?? {}), dimension: this.dimension }
    })

    effect(() => {
      this.smartFilterService.dataSettings = this.dataSettings
    })

    effect(() => {
      switch (this.appearance?.displayDensity) {
        case DisplayDensity.compact:
          this.itemSize = 30
          break
        case DisplayDensity.cosy:
          this.itemSize = 40
          break
        default:
          this.itemSize = 50
      }
    })
  }

  writeValue(obj: any): void {
    if (obj) {
      // ??? 是否需要用 {...obj} 来复制一份
      this.slicer.set({ ...obj })
    }
  }
  registerOnChange(fn: any): void {
    this.onChange = fn
  }
  registerOnTouched(fn: any): void {
    //
  }
  setDisabledState?(isDisabled: boolean): void {
    //
  }

  /** Whether the number of selected elements matches the total number of rows. */
  isAllSelected() {
    const members = this.slicer()?.members
    const numSelected = members?.length
    const numRows = this.rows().length
    return numSelected === numRows
  }
  /** Selects all rows if they are not all selected; otherwise clear selection. */
  masterToggle() {
    if (this.isAllSelected()) {
      this.clearMembers()
      return
    }

    this.selectMembers(this.rows())
  }

  hasMember() {
    const members = this.slicer()?.members
    return !isEmpty(members)
  }

  isSelected(row: T | IDimensionMember) {
    const members = this.slicer()?.members
    const value =
      typeof row === 'object' && row !== null && 'memberKey' in row
        ? row.memberKey
        : row?.[getPropertyHierarchy(this.dimension)]
    return !!members?.find((item) => item.value === value)
  }

  toggleMember(row: T) {
    const caption = getDimensionMemberCaption(this.dimension, this.smartFilterService.entityType)
    const member: IMember = {
      key: row[getPropertyHierarchy(this.dimension)],
      value: row[getPropertyHierarchy(this.dimension)],
      label: row[caption],
      caption: row[caption]
    }

    const index = this.slicer()?.members?.findIndex((item) => item.key === member.key)
    if (index > -1) {
      this.slicer.update((state) => {
        const members = [...this.slicer().members]
        members.splice(index, 1)
        return {
          ...state,
          members
        }
      })
    } else {
      this.slicer.update((state) => ({ ...(state ?? { dimension: this.dimension }), members: state?.members ?? [] }))
      if (this.options?.selectionType === FilterSelectionType.Multiple) {
        this.slicer.update((state) => {
          const members = this.slicer().members
          return {
            ...state,
            members: [...members, member]
          }
        })
      } else {
        this.slicer.update((state) => {
          return {
            ...state,
            members: [member]
          }
        })
      }
    }
  }

  selectMembers(members: T[]) {
    const caption = getDimensionMemberCaption(this.dimension, this.smartFilterService.entityType)

    this.slicer.update((state) => {
      return {
        ...state,
        members: members.map(
          (row) =>
            ({
              key: row[getPropertyHierarchy(this.dimension)],
              value: row[getPropertyHierarchy(this.dimension)],
              label: row[caption],
              caption: row[caption]
            }) as IMember
        )
      }
    })
  }

  clearMembers() {
    this.slicer.update((state) => {
      return {
        ...state,
        members: []
      }
    })
  }

  trackMember = (_index: number, row: T) => row?.[getPropertyHierarchy(this.dimension)] ?? _index
}
