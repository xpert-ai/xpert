import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  HostBinding,
  inject,
  Inject,
  Optional,
  signal
} from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInputModule } from '@angular/material/input'
import { MatSlideToggleModule } from '@angular/material/slide-toggle'
import { MatTooltipModule } from '@angular/material/tooltip'
import { environment } from '@cloud/environments/environment'
import { DataSourceProtocolEnum, DataSourceService, DataSourceTypesService } from '@metad/cloud/state'
import { NgmInputComponent, NgmRadioSelectComponent } from '@metad/ocap-angular/common'
import { ButtonGroupDirective, myRxResource, NgmDensityDirective } from '@metad/ocap-angular/core'
import { cloneDeep } from '@metad/ocap-core'
import { ContentLoaderModule } from '@ngneat/content-loader'
import { FormlyModule } from '@ngx-formly/core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { assign, isEqual, isNil, omitBy } from 'lodash-es'
import { derivedAsync } from 'ngxtension/derived-async'
import { firstValueFrom, map, of, startWith } from 'rxjs'
import {
  AuthenticationEnum,
  convertConfigurationSchema,
  getErrorMessage,
  IDataSource,
  LocalAgent,
  ServerAgent,
  ToastrService
} from '../../../../@core'

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
export class PACDataSourceEditComponent {
  AuthenticationEnum = AuthenticationEnum
  enableLocalAgent = environment.enableLocalAgent
  @HostBinding('class.ngm-dialog-container') isDialogContainer = true

  readonly dataSourceTypesAPI = inject(DataSourceTypesService)
  readonly dataSourceService = inject(DataSourceService)

  readonly dataSourceId = signal(this.data?.id)
  readonly _loading = signal(false)

  model = {}
  formGroup = new FormGroup({
    name: new FormControl(),
    useLocalAgent: new FormControl(),
    authType: new FormControl<AuthenticationEnum>(null),
  })
  readonly optionsFormGroup = new FormGroup({})
  get nameCtrl() {
    return this.formGroup.get('name')
  }

  readonly dataSourceTypes = toSignal(this.dataSourceTypesAPI.types$)

  readonly isXmla = computed(() => this.dataSourceType()?.protocol === DataSourceProtocolEnum.XMLA)

  readonly schema$ = derivedAsync(() => {
    const dataSourceType = this.dataSourceType()
    return dataSourceType?.configuration
      ? this.translateService
          .stream('PAC.DataSources.Schema')
          .pipe(map((i18n) => convertConfigurationSchema(dataSourceType.configuration, i18n)))
      : of(null)
  })

  readonly #dataSourceRs = myRxResource({
    request: () => this.data.id,
    loader: ({ request }) => {
      return this.dataSourceService.getOne(request)
    }
  })
  readonly dataSource = this.#dataSourceRs.value
  readonly #loading = computed(() => this.#dataSourceRs.status() === 'loading')
  readonly loading = computed(() => this.#loading() || this._loading())

  readonly dataSourceType = computed(() => {
    const selected = this.dataSource()
    return selected ? this.dataSourceTypes()?.find((item) => item.type === selected.type?.type) : null
  })

  readonly formValue = toSignal(this.optionsFormGroup.valueChanges.pipe(startWith(this.optionsFormGroup.value)))
  readonly dirty = computed(() => !isEqual(this.dataSource()?.options, omitBy(this.formValue(), isNil)))

  constructor(
    private translateService: TranslateService,
    public dialogRef: DialogRef<boolean>,
    @Inject(DIALOG_DATA) public data: Pick<IDataSource, 'id'>,
    private toastrService: ToastrService,
    private serverAgent: ServerAgent,
    @Optional() private localAgent?: LocalAgent
  ) {
    effect(
      () => {
        const dataSource = this.dataSource()
        if (dataSource) {
          this.formGroup.patchValue(dataSource)
          this.optionsFormGroup.patchValue(dataSource.options)
          assign(this.model, dataSource.options)
        }
      },
      { allowSignalWrites: true }
    )
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
    this._loading.set(true)
    try {
      await agent.request(
        {
          type: this.dataSource().type.protocol.toUpperCase(),
          dataSource: {
            ...this.dataSource(),
            ...this.formGroup.value
          }
        },
        {
          method: 'get',
          url: 'ping',
          body: {
            ...this.formGroup.value,
            type: this.dataSource().type
          }
        }
      )

      this._loading.set(false)
      this.toastrService.success('PAC.ACTIONS.PING', { Default: 'Ping' })
    } catch (err) {
      const message = getErrorMessage(err)
      this._loading.set(false)
      this.toastrService.error(message)
    }
  }
}
