import { ScrollingModule } from '@angular/cdk/scrolling'
import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  EventEmitter,
  forwardRef,
  HostBinding,
  inject,
  Input,
  Output,
  signal,
} from '@angular/core'
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop'
import { ControlValueAccessor, FormControl, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms'
import { MatCheckboxModule } from '@angular/material/checkbox'
import { MatIconModule } from '@angular/material/icon'
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'
import { MatTableModule } from '@angular/material/table'
import { NgmCommonModule, TableVirtualScrollDataSource } from '@metad/ocap-angular/common'
import { DisplayDensity, NgmAppearance, OcapCoreModule } from '@metad/ocap-angular/core'
import {
  DataSettings,
  Dimension,
  FilterSelectionType,
  getDimensionMemberCaption,
  getPropertyHierarchy,
  IDimensionMember,
  IMember,
  ISlicer
} from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { isEmpty, isEqual } from 'lodash-es'
import { debounceTime, distinctUntilChanged, map, shareReplay } from 'rxjs/operators'
import { NgmSmartFilterService } from '../smart-filter.service'
import { ControlOptions } from '../types'

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
    ReactiveFormsModule,
    MatIconModule,
    MatCheckboxModule,
    MatProgressSpinnerModule,
    MatTableModule,
    ScrollingModule,
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
  dataSource = new TableVirtualScrollDataSource<T>([])

  public readonly options$ = toObservable(this._options)
  public readonly selectionType$ = this.options$.pipe(map((options) => options?.selectionType))
  public readonly multiple$ = this.selectionType$.pipe(
    map((selectionType) => selectionType === FilterSelectionType.Multiple)
  )
  public readonly slicer$ = toObservable(this.slicer)

  public readonly results$ = this.smartFilterService.selectResult()
  public readonly schema$ = this.results$.pipe(map((result) => result?.schema))
  public readonly columns$ = this.schema$.pipe(map((schema) => [...(schema?.rows ?? []), ...(schema?.columns ?? [])]))
  public readonly displayedColumns$ = this.columns$.pipe(
    map((columns) => ['select', ...columns.map((col) => col.name)]),
    shareReplay(1)
  )

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
  private slicerSub = this.slicer$.pipe(distinctUntilChanged(isEqual), takeUntilDestroyed())
    .subscribe((slicer) => {
      this.onChange?.({
        ...slicer,
        dimension: this.dimension
      })
    })
  private resultSub = this.results$.pipe(takeUntilDestroyed()).subscribe((results) => {
    if (results.data) {
      this.dataSource.data = results.data as unknown as T[]
    }
  })
  private searchSub = this.searchControl.valueChanges
    .pipe(debounceTime(500), takeUntilDestroyed())
    .subscribe((text) => {
      this.dataSource.filter = text.trim().toLowerCase()
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
    const numRows = this.dataSource.data.length
    return numSelected === numRows
  }
  /** Selects all rows if they are not all selected; otherwise clear selection. */
  masterToggle() {
    if (this.isAllSelected()) {
      this.clearMembers()
      return
    }

    this.selectMembers(this.dataSource.data)
  }

  hasMember() {
    const members = this.slicer()?.members
    return !isEmpty(members)
  }

  isSelected(row: IDimensionMember) {
    const members = this.slicer()?.members
    const value = row.memberKey
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
      this.slicer.update((state) => ({...(state ?? {dimension: this.dimension}), members: state?.members ?? []}))
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
            } as IMember)
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
}
