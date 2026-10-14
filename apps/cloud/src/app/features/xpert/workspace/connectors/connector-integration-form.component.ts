import { Component, effect, inject, input, signal } from '@angular/core'
import { FormControl, FormRecord, ReactiveFormsModule, Validators } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'
import { v4 as uuid } from 'uuid'
import {
  XpI18nPipe,
  ZardButtonComponent,
  ZardFormImports,
  ZardInputDirective,
  ZardSelectImports
} from '@xpert-ai/headless-ui'
import type {
  ConnectorAppCredentialsConfig,
  ConnectorIntegrationOption,
  ConnectorIntegrationSelection
} from '@xpert-ai/plugin-sdk/connector'
import { getErrorMessage, XpertConnectorService } from 'apps/cloud/src/app/@core'
import { environment } from 'apps/cloud/src/environments/environment'
import { resolveAbsoluteApiUrl } from 'apps/cloud/src/app/@core/providers/url'
import { API_CONNECTOR } from 'apps/cloud/src/app/@core/constants/app.constants'

@Component({
  selector: 'xpert-connector-integration-form',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    TranslateModule,
    XpI18nPipe,
    ZardButtonComponent,
    ZardInputDirective,
    ...ZardFormImports,
    ...ZardSelectImports
  ],
  templateUrl: './connector-integration-form.component.html'
})
export class ConnectorIntegrationFormComponent {
  private readonly connectors = inject(XpertConnectorService)
  readonly workspaceId = input.required<string>()
  readonly provider = input.required<string>()
  readonly defaultName = input.required<string>()
  readonly authMethodId = input.required<string>()
  readonly config = input.required<NonNullable<ConnectorAppCredentialsConfig['integration']>>()
  readonly savedIntegrationId = input<string | null>()
  readonly readonly = input(false)
  readonly options = signal<ConnectorIntegrationOption[]>([])
  readonly loading = signal(true)
  readonly error = signal<string | null>(null)
  readonly mode = signal<'existing' | 'new'>('existing')
  readonly form = new FormRecord<FormControl<string>>({})
  readonly callbackUrl = resolveAbsoluteApiUrl(`${API_CONNECTOR}/oauth/callback`, environment.API_BASE_URL)
  private requestId = uuid()
  private integrationName = ''
  private loadId = 0

  constructor() {
    effect(() => {
      const workspaceId = this.workspaceId(),
        provider = this.provider(),
        method = this.authMethodId()
      this.config()
      const savedId = this.savedIntegrationId()
      const loadId = ++this.loadId
      this.configure('existing', savedId ?? '')
      this.loading.set(true)
      this.error.set(null)
      void firstValueFrom(this.connectors.integrationOptions(workspaceId, provider, method))
        .then((options) => {
          if (loadId !== this.loadId) return
          this.options.set(options)
        })
        .catch((error) => {
          if (loadId === this.loadId) this.error.set(getErrorMessage(error))
        })
        .finally(() => {
          if (loadId === this.loadId) this.loading.set(false)
        })
    })
  }

  configure(mode: 'existing' | 'new', selected = this.form.controls.integrationId?.value ?? '') {
    this.mode.set(mode)
    for (const name of Object.keys(this.form.controls)) this.form.removeControl(name)
    if (mode === 'existing')
      this.form.addControl(
        'integrationId',
        new FormControl(selected, { nonNullable: true, validators: [Validators.required] })
      )
    else {
      this.requestId = uuid()
      this.integrationName = `${this.defaultName().trim().slice(0, 91)}-${this.requestId.slice(0, 8).toUpperCase()}`
      for (const field of this.config().fields)
        this.form.addControl(
          field.name,
          new FormControl('', { nonNullable: true, validators: field.required ? [Validators.required] : [] })
        )
    }
  }

  selectedName() {
    return this.options().find((option) => option.id === this.savedIntegrationId())?.name
  }

  selection(): ConnectorIntegrationSelection | null {
    this.form.markAllAsTouched()
    if (this.loading() || this.error() || this.form.invalid) return null
    if (this.mode() === 'existing') {
      const integrationId = this.form.controls.integrationId.value
      return this.options().some((option) => option.id === integrationId) ? { type: 'existing', integrationId } : null
    }
    const values: { [field: string]: string } = {}
    for (const field of this.config().fields) values[field.name] = this.form.controls[field.name].value.trim()
    if (this.config().fields.some((field) => field.required && !values[field.name])) return null
    return { type: 'new', requestId: this.requestId, name: this.integrationName, values }
  }

  remember(option: ConnectorIntegrationOption) {
    if (!this.options().some((item) => item.id === option.id)) this.options.update((items) => [...items, option])
    this.configure('existing', option.id)
  }
}
