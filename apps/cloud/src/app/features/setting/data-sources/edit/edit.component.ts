import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  HostBinding,
  Inject,
  OnInit,
  Optional,
  signal
} from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInputModule } from '@angular/material/input'
import { MatTooltipModule } from '@angular/material/tooltip'
import { environment } from '@cloud/environments/environment'
import { DataSourceProtocolEnum, DataSourceService, DataSourceTypesService } from '@metad/cloud/state'
import { NgmInputComponent, NgmRadioSelectComponent } from '@metad/ocap-angular/common'
import { ButtonGroupDirective, NgmDensityDirective } from '@metad/ocap-angular/core'
import { cloneDeep } from '@metad/ocap-core'
import { ContentLoaderModule } from '@ngneat/content-loader'
import { FormlyModule } from '@ngx-formly/core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { derivedAsync } from 'ngxtension/derived-async'
import { BehaviorSubject, combineLatest, filter, firstValueFrom, map, of } from 'rxjs'
import {
  AuthenticationEnum,
  convertConfigurationSchema,
  getErrorMessage,
  IDataSource,
  LocalAgent,
  ServerAgent,
  ToastrService
} from '../../../../@core'
import { MatSlideToggleModule } from '@angular/material/slide-toggle'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    ReactiveFormsModule,
    DragDropModule,
    MatInputModule,
    MatFormFieldModule,
    MatTooltipModule,
    MatButtonModule,
    MatSlideToggleModule,

    FormlyModule,
    ContentLoaderModule,
    ButtonGroupDirective,
    NgmDensityDirective,
    NgmInputComponent,
    NgmRadioSelectComponent
  ],
  selector: 'pac-data-source-edit',
  templateUrl: 'edit.component.html',
  styleUrls: ['edit.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PACDataSourceEditComponent implements OnInit {
  AuthenticationEnum = AuthenticationEnum
  enableLocalAgent = environment.enableLocalAgent
  @HostBinding('class.ngm-dialog-container') isDialogContainer = true

  readonly dataSourceId = signal(this.data?.id)

  loading = false
  model = {}
  formGroup = new FormGroup({
    name: new FormControl(),
    useLocalAgent: new FormControl(),
    authType: new FormControl<AuthenticationEnum>(null),
    options: new FormGroup({})
  })
  get nameCtrl() {
    return this.formGroup.get('name')
  }
  get options() {
    return this.formGroup.get('options') as FormGroup
  }

  readonly selected$ = new BehaviorSubject<IDataSource>(null)
  get dataSource() {
    return this.selected$.value
  }

  readonly dataSourceTypes$ = this.dataSourceTypes.types$.pipe(takeUntilDestroyed())

  readonly dataSourceType = toSignal(
    combineLatest([this.selected$.pipe(filter(Boolean)), this.dataSourceTypes$]).pipe(
      map(([selected, types]) => types?.find((item) => item.type === selected.type?.type))
    )
  )
  readonly isXmla = computed(() => this.dataSourceType()?.protocol === DataSourceProtocolEnum.XMLA)

  readonly schema$ = derivedAsync(() => {
    const dataSourceType = this.dataSourceType()
    return dataSourceType?.configuration
      ? this.translateService
          .stream('PAC.DataSources.Schema')
          .pipe(map((i18n) => convertConfigurationSchema(dataSourceType.configuration, i18n)))
      : of(null)
  })

  constructor(
    private dataSourceTypes: DataSourceTypesService,
    private dataSourceService: DataSourceService,
    private translateService: TranslateService,
    public dialogRef: DialogRef<boolean>,
    @Inject(DIALOG_DATA) public data: Pick<IDataSource, 'id'>,
    private toastrService: ToastrService,
    private serverAgent: ServerAgent,
    @Optional() private localAgent?: LocalAgent
  ) {}

  async ngOnInit() {
    if (this.data?.id) {
      const dataSource = await firstValueFrom(this.dataSourceService.getOne(this.data.id))
      this.selected$.next(dataSource)
      this.formGroup.patchValue(dataSource)
      this.model = dataSource.options
    }
  }

  onCancel() {
    this.dialogRef.close()
  }

  async onSave() {
    try {
      await firstValueFrom(
        this.dataSourceService.update(this.data.id, {
          ...this.formGroup.value,
          options: this.model
        })
      )
      this.toastrService.success('PAC.MESSAGE.Update', { Default: 'Update' })
      this.dialogRef.close(true)
    } catch (err) {
      this.toastrService.error('', 'PAC.MESSAGE.Update', { Default: 'Update' })
    }
  }

  onReset() {
    const dataSource = cloneDeep(this.data)
    this.formGroup.clearValidators()
    this.formGroup.reset(dataSource)
    this.model = dataSource.options
  }

  async ping() {
    const agent = this.formGroup.value.useLocalAgent ? this.localAgent : this.serverAgent
    this.loading = true
    try {
      await agent.request(
        {
          type: this.dataSource.type.protocol.toUpperCase(),
          dataSource: {
            ...this.dataSource,
            ...this.formGroup.value
          }
        },
        {
          method: 'get',
          url: 'ping',
          body: {
            ...this.formGroup.value,
            type: this.dataSource.type
          }
        }
      )

      this.loading = false
      this.toastrService.success('PAC.ACTIONS.PING', { Default: 'Ping' })
    } catch (err) {
      const message = getErrorMessage(err)
      this.loading = false
      this.toastrService.error(message)
    }
  }
}
