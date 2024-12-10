import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, forwardRef, inject, signal } from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import {
  ControlValueAccessor,
  FormControl,
  FormGroup,
  FormsModule,
  NG_VALUE_ACCESSOR,
  ReactiveFormsModule,
  Validators
} from '@angular/forms'
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog'
import { BusinessAreasService, DataSourceService } from '@metad/cloud/state'
import { nonBlank } from '@metad/core'
import { NgmSelectionTableComponent, NgmTreeSelectComponent, SelectionTableColumn } from '@metad/ocap-angular/common'
import { ButtonGroupDirective, DensityDirective, NgmDSCoreService } from '@metad/ocap-angular/core'
import { AgentType, Catalog, isNil } from '@metad/ocap-core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { environment } from 'apps/cloud/src/environments/environment'
import { Observable, Subject, catchError, filter, map, of, startWith, switchMap, tap } from 'rxjs'
import { IDataSource, getErrorMessage } from '../../../@core'
import { MaterialModule } from '../../../@shared/material.module'

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'pac-model-creation',
  templateUrl: 'creation.component.html',
  styleUrls: ['creation.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MaterialModule,
    TranslateModule,
    DensityDirective,
    ButtonGroupDirective,
    NgmTreeSelectComponent,
    NgmSelectionTableComponent
  ],
  host: {
    class: 'pac-model-creation'
  },
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      multi: true,
      useExisting: forwardRef(() => ModelCreationComponent)
    },
    NgmDSCoreService
  ]
})
export class ModelCreationComponent implements ControlValueAccessor {
  private translateService = inject(TranslateService)
  private dataSourceService = inject(DataSourceService)
  private businessAreaService = inject(BusinessAreasService)
  private dsCoreService = inject(NgmDSCoreService)
  private data = inject<{ name: string; description: string; businessAreaId: string; type: 'mdx' | 'sql' | null }>(
    MAT_DIALOG_DATA
  )
  private dialogRef = inject(MatDialogRef<ModelCreationComponent>)

  formGroup = new FormGroup({
    name: new FormControl('', [Validators.required]),
    description: new FormControl(null),
    businessAreaId: new FormControl(null),
    mdx: new FormControl(true),
    dataSource: new FormControl(null, [Validators.required]),
    catalog: new FormControl()
  })

  get dataSource() {
    return this.formGroup.get('dataSource')
  }
  get currentDataSource(): IDataSource {
    return this.dataSource.value
  }
  get enableMDX() {
    return (
      (isNil(this.data?.type) || this.data.type === 'mdx') &&
      !this.currentDataSource?.useLocalAgent &&
      this.currentDataSource?.type?.protocol.toUpperCase() !== 'XMLA'
    )
  }

  readonly dataSourceKey$ = new Subject<string>()

  // public readonly dataSource$ = new Subject<DataSource>()
  readonly _columns = signal<SelectionTableColumn[]>([
    { value: 'name', label: 'Name', sticky: true },
    { value: 'type.type', label: 'Type' },
    { value: 'type.protocol', label: 'Protocol' },
    { value: 'useLocalAgent', label: 'UseLocalAgent', type: 'boolean' }
  ])
  readonly i18nMODEL = toSignal(this.translateService.stream('PAC.MENU.MODEL'))
  readonly dataSourceColumns = computed(() => {
    const enableLocalAgent = environment.enableLocalAgent
    const i18nMODEL = this.i18nMODEL()
    return this._columns()
      .filter((col) => (enableLocalAgent ? true : col.value !== 'useLocalAgent'))
      .map((col) => ({
        ...col,
        label: i18nMODEL?.SELECT_DATASOURCE_COLUMNS?.[col.label] ?? col.label
      }))
  })

  public readonly catalogColumns$ = of<SelectionTableColumn[]>([
    {
      value: 'name',
      label: 'Name',
      sticky: true
    },
    {
      value: 'label',
      label: 'Label'
    },
    {
      value: 'type',
      label: 'Type'
    }
  ]).pipe(
    switchMap((columns) =>
      this.translateService.stream('PAC.MENU.MODEL').pipe(
        map((MODEL: any) => {
          return columns.map((col) => ({
            ...col,
            label: MODEL?.CATALOG_COLUMNS?.[col.label] ?? col.label
          }))
        })
      )
    )
  )

  public readonly connections$: Observable<Array<IDataSource>> = this.dataSourceService.getAll(['type']).pipe(
    map((data: any) =>
      data.filter((item) => {
        if (this.data?.type === 'mdx') {
          return item.type?.protocol === 'xmla' || (item.type?.protocol === 'sql' && !item.useLocalAgent)
        }
        return this.data?.type ? item.type?.protocol === this.data.type : true
      })
    )
  )

  readonly catalogs$ = this.dataSourceKey$.pipe(
    filter(nonBlank),
    switchMap((key) => this.dsCoreService.getDataSource(key)),
    tap(() => {
      this.catalogsLoading.set(true)
      this.discoverDBCatalogsError.set(null)
    }),
    switchMap((dataSource) =>
      dataSource.discoverDBCatalogs().pipe(
        catchError((err) => {
          this.catalogsLoading.set(false)
          this.discoverDBCatalogsError.set(getErrorMessage(err))
          return of([])
        })
      )
    ),
    tap(() => this.catalogsLoading.set(false))
  )

  readonly businessAreas$ = this.businessAreaService.getMyAreasTree().pipe(startWith([]))
  /**
  |--------------------------------------------------------------------------
  | Signals
  |--------------------------------------------------------------------------
  */
  readonly catalogsLoading = signal(false)
  readonly discoverDBCatalogsError = signal('')

  /**
  |--------------------------------------------------------------------------
  | Subscriptions (effect)
  |--------------------------------------------------------------------------
  */
  private _dataSourceSub = this.dataSource.valueChanges
    .pipe(filter(Boolean), takeUntilDestroyed())
    .subscribe(async (dataSource) => {
      const key = dataSource.id
      this.dsCoreService.registerModel({
        name: dataSource.name,
        key: key,
        type: dataSource.type.protocol.toUpperCase() as any,
        agentType: dataSource.useLocalAgent ? AgentType.Local : AgentType.Server,
        dataSource,
        settings: {
          dataSourceId: dataSource.id,
          dataSourceInfo: dataSource.options?.data_source_info,
          ignoreUnknownProperty: true
        }
      } as any)

      this.dataSourceKey$.next(key)

      // const _dataSource = await firstValueFrom(this.dsCoreService.getDataSource(dataSource.key))
      // this.dataSource$.next(_dataSource)
    })

  private _formValueSub = this.formGroup.valueChanges.subscribe((value) => {
    this._onChange?.(value)
  })

  private _onChange: (value: any) => void
  constructor() {
    if (this.data.type) {
      this.formGroup.get('mdx').setValue(this.data.type === 'mdx')
    }
    if (this.data.name) {
      this.formGroup.get('name').setValue(this.data.name)
    }
    if (this.data.description) {
      this.formGroup.get('description').setValue(this.data.description)
    }
    if (this.data.businessAreaId) {
      this.formGroup.get('businessAreaId').setValue(this.data.businessAreaId)
    }
  }

  writeValue(obj: any): void {
    if (obj) {
      this.formGroup.setValue(obj)
    }
  }
  registerOnChange(fn: any): void {
    this._onChange = fn
  }
  registerOnTouched(fn: any): void {}
  setDisabledState?(isDisabled: boolean): void {}

  async create() {
    const catalog: Catalog = this.formGroup.value.catalog
    this.dialogRef.close({
      name: this.formGroup.value.name,
      description: this.formGroup.value.description,
      type: this.formGroup.value.mdx ? 'XMLA' : this.formGroup.value.dataSource.type.protocol.toUpperCase(),
      dataSourceId: this.formGroup.value.dataSource.id,
      catalog: catalog?.name,
      cube: '',
      businessAreaId: this.formGroup.value.businessAreaId
    })
  }
}
