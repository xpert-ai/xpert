import { Component, OnInit, computed, effect, inject, signal } from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'
import { DataSourceProtocolEnum, DataSourceService, DataSourceTypesService } from '@xpert-ai/cloud/state'
import { AuthenticationEnum, getErrorMessage, IDataSource, IDataSourceType } from '@cloud/app/@core/types'
import { omit } from 'lodash-es'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { BehaviorSubject, firstValueFrom, startWith } from 'rxjs'
import { convertConfigurationSchema } from '@cloud/app/@core/services/configuration-schema.service'
import { ServerSocketAgent } from '@cloud/app/@core/services/server-socket-agent.service'
import { ToastrService } from '@cloud/app/@core/services/toastr.service'
import { CommonModule } from '@angular/common'

import { FormlyModule } from '@ngx-formly/core'
import {
  Z_MODAL_DATA,
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardDialogRef,
  ZardEmptyComponent,
  ZardFormImports,
  ZardIconComponent,
  ZardInputDirective,
  ZardLoaderComponent,
  ZardTooltipImports
} from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    FormlyModule,
    ReactiveFormsModule,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardEmptyComponent,
    ZardIconComponent,
    ZardInputDirective,
    ZardLoaderComponent,
    ...ZardFormImports,
    ...ZardTooltipImports
  ],
  selector: 'xp-data-source-creation',
  templateUrl: './creation.component.html',
  styleUrls: ['./creation.component.scss']
})
export class XpDataSourceCreationComponent implements OnInit {
  AuthenticationEnum = AuthenticationEnum

  private typesService = inject(DataSourceTypesService)
  private dataSourceService = inject(DataSourceService)
  private toastrService = inject(ToastrService)
  private translateService = inject(TranslateService)
  private data = inject<IDataSource | null>(Z_MODAL_DATA, { optional: true })
  public dialogRef = inject<ZardDialogRef<XpDataSourceCreationComponent, Partial<IDataSource>>>(ZardDialogRef)
  private serverAgent = inject(ServerSocketAgent)

  readonly loading = signal(false)

  readonly connectionTypes$ = this.typesService.types$.pipe(takeUntilDestroyed())
  readonly connectionTypes = toSignal(this.connectionTypes$, { initialValue: null })
  public typeFormGroup = new FormGroup({
    type: new FormControl<string | null>(null, [Validators.required])
  })

  readonly selectedTypeId = toSignal(
    this.typeFormGroup.controls.type.valueChanges.pipe(startWith(this.typeFormGroup.controls.type.value))
  )
  readonly initialDataSourceType = signal<IDataSourceType | null>(null)
  readonly connectionTypeOptions = computed(() => {
    const types = this.connectionTypes() ?? []
    const selectedType = this.initialDataSourceType()
    const options = [...types]

    if (selectedType && !options.some((type) => type.id === selectedType.id)) {
      options.push(selectedType)
    }

    return options
  })
  readonly dataSourceType = computed(() => {
    const selectedTypeId = this.selectedTypeId()
    return selectedTypeId ? this.connectionTypeOptions().find((type) => type.id === selectedTypeId) : null
  })

  formGroup = new FormGroup({
    name: new FormControl(null, [Validators.required]),
    authType: new FormControl<AuthenticationEnum>(null),
    options: new FormGroup({})
  })

  get nameCtrl() {
    return this.formGroup.get('name')
  }
  get options() {
    return this.formGroup.get('options') as FormGroup
  }

  model = {}
  readonly fields$ = new BehaviorSubject([])

  // Signal States
  readonly isXmla = computed(() => this.dataSourceType()?.protocol === DataSourceProtocolEnum.XMLA)

  private _typeFieldsEffect = effect(() => {
    const type = this.dataSourceType()
    if (type) {
      const i18n = this.translateService.instant('XP.DataSources.Schema')
      this.fields$.next(convertConfigurationSchema(type.configuration, i18n))
    }
  })

  async ngOnInit() {
    if (this.data?.id) {
      const dataSource = await firstValueFrom(this.dataSourceService.getOne(this.data.id))
      this.initialDataSourceType.set(dataSource.type)
      this.typeFormGroup.patchValue({
        type: dataSource.type.id
      })
      this.formGroup.patchValue(omit(dataSource, 'id'))
      this.model = dataSource.options
    }
  }

  async onSave() {
    if (this.formGroup.valid) {
      const result = await firstValueFrom(
        this.dataSourceService.create({
          ...this.formGroup.value,
          typeId: this.dataSourceType().id
        })
      )

      this.toastrService.success('XP.MESSAGE.CreateDataSource', { Default: 'Create data source' })
      this.dialogRef.close(result)
    }
  }

  onCancel() {
    this.dialogRef.close()
  }

  async ping() {
    this.loading.set(true)
    try {
      await this.serverAgent.request(
        {
          type: this.dataSourceType().protocol.toUpperCase(),
          dataSource: {
            ...this.formGroup.value,
            type: this.dataSourceType()
          }
        },
        {
          method: 'get',
          url: 'ping',
          body: {
            ...this.formGroup.value,
            type: this.dataSourceType()
          }
        }
      )

      this.loading.set(false)
      this.toastrService.success('XP.ACTIONS.PING', { Default: 'Ping' })
    } catch (err) {
      const message = getErrorMessage(err)
      this.loading.set(false)
      this.toastrService.error(message)
    }
  }
}
