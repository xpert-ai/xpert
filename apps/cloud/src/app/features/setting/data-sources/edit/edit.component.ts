import { Component, HostBinding, Inject, OnInit, Optional } from '@angular/core'
import { FormControl, FormGroup } from '@angular/forms'
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog'
import { ButtonGroupDirective } from '@metad/ocap-angular/core'
import { cloneDeep } from '@metad/ocap-core'
import { ContentLoaderModule } from '@ngneat/content-loader'
import { FormlyModule } from '@ngx-formly/core'
import { TranslateService } from '@ngx-translate/core'
import { DataSourceService, DataSourceTypesService } from '@metad/cloud/state'
import { BehaviorSubject, combineLatest, filter, firstValueFrom, map, switchMap } from 'rxjs'
import {
  AuthenticationEnum,
  convertConfigurationSchema,
  getErrorMessage,
  IDataSource,
  LocalAgent,
  ServerAgent,
  ToastrService
} from '../../../../@core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { environment } from 'apps/cloud/src/environments/environment'
import { NgmInputComponent } from '@metad/ocap-angular/common'
import { MaterialModule } from 'apps/cloud/src/app/@shared/material.module'
import { SharedModule } from 'apps/cloud/src/app/@shared/shared.module'

@Component({
  standalone: true,
  imports: [
    SharedModule,
    MaterialModule,
    FormlyModule,
    ContentLoaderModule,
    ButtonGroupDirective,
    NgmInputComponent
  ],
  selector: 'pac-data-source-edit',
  templateUrl: 'edit.component.html',
  styleUrls: ['edit.component.scss']
})
export class PACDataSourceEditComponent implements OnInit {
  AuthenticationEnum = AuthenticationEnum
  enableLocalAgent = environment.enableLocalAgent
  @HostBinding('class.ngm-dialog-container') isDialogContainer = true

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

  public readonly dataSourceTypes$ = this.dataSourceTypes.types$.pipe(takeUntilDestroyed())

  readonly schema$ = toSignal(combineLatest([this.selected$.pipe(filter(Boolean)), this.dataSourceTypes$]).pipe(
    map(([selected, types]) => types?.find((item) => item.type === selected.type?.type)?.configuration),
    filter(Boolean),
    switchMap(async (schema) => {
      const i18n = await firstValueFrom(this.translateService.get('PAC.DataSources.Schema'))
      return convertConfigurationSchema(schema, i18n)
    })
  ))

  constructor(
    private dataSourceTypes: DataSourceTypesService,
    private dataSourceService: DataSourceService,
    private translateService: TranslateService,
    public dialogRef: MatDialogRef<PACDataSourceEditComponent>,
    @Inject(MAT_DIALOG_DATA) public data: Pick<IDataSource, 'id'>,
    private toastrService: ToastrService,
    private serverAgent: ServerAgent,
    @Optional() private localAgent?: LocalAgent,
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
      await firstValueFrom(this.dataSourceService
        .update(this.data.id, {
          ...this.formGroup.value,
          options: this.model
        }))
      this.toastrService.success('PAC.MESSAGE.Update', {Default: 'Update'})
      this.dialogRef.close(true)
    } catch(err) {
      this.toastrService.error('', 'PAC.MESSAGE.Update', {Default: 'Update'})
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
      await agent.request({
        type: this.dataSource.type.protocol.toUpperCase(),
        dataSource: {
          ...this.dataSource,
          ...this.formGroup.value
        }
      }, {
        method: 'get',
        url: 'ping',
        body: {
          ...this.formGroup.value,
          type: this.dataSource.type
        }
      })

      this.loading = false
      this.toastrService.success('PAC.ACTIONS.PING', {Default: 'Ping'})
    } catch(err) {
      const message = getErrorMessage(err)
      this.loading = false
      this.toastrService.error(message)
    }
  }
}
