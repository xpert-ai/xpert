import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core'
import { FormControl, FormRecord, ReactiveFormsModule, Validators } from '@angular/forms'
import {
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardFormImports,
  ZardIconComponent,
  ZardInputDirective,
  ZardSelectImports
} from '@xpert-ai/headless-ui'
import { NgmSpinComponent } from '@xpert-ai/ocap-angular/common'
import { NgmI18nPipe } from '@xpert-ai/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { getConnectorAuthMethods } from '@xpert-ai/plugin-sdk/connector'
import type {
  ConnectorAppCredentialField,
  ConnectorAuthMethodDefinition,
  ConnectorCredentialFormDefinition,
  ConnectorInstance,
  ConnectorStrategyDefinition
} from '@xpert-ai/plugin-sdk/connector'
import { Link2Off } from 'lucide-angular'
import { firstValueFrom } from 'rxjs'
import { getErrorMessage, injectToastr, XpertConnectorService, XpertWorkspaceService } from 'apps/cloud/src/app/@core'
import { XpertWorkspaceHomeComponent } from '../home/home.component'

type ConnectorStatusLabel = {
  key: string
  defaultLabel: string
}

@Component({
  selector: 'xpert-connectors',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    TranslateModule,
    NgmI18nPipe,
    NgmSpinComponent,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardIconComponent,
    ZardInputDirective,
    ...ZardFormImports,
    ...ZardSelectImports
  ],
  templateUrl: './connectors.component.html'
})
export class XpertConnectorsComponent {
  readonly #connectorService = inject(XpertConnectorService)
  readonly #workspaceService = inject(XpertWorkspaceService)
  readonly #toastr = injectToastr()
  readonly #destroyRef = inject(DestroyRef)

  readonly homeComponent = inject(XpertWorkspaceHomeComponent)
  readonly workspace = this.homeComponent.workspace
  readonly workspaceId = computed(() => this.workspace()?.id)
  readonly canManageWorkspace = computed(() => this.#workspaceService.canManage(this.workspace()))

  readonly definitions = signal<ConnectorStrategyDefinition[]>([])
  readonly connectors = signal<ConnectorInstance[]>([])
  readonly loading = signal(false)
  readonly connectingProvider = signal<string | null>(null)
  readonly pollingConnectorId = signal<string | null>(null)
  readonly disconnectingConnectorId = signal<string | null>(null)
  readonly pendingAuthorizationUrls = signal<Record<string, string>>({})
  readonly reloadKey = signal(0)
  readonly disconnectIcon = Link2Off
  #authorizationPollTimer: ReturnType<typeof setTimeout> | null = null
  #authorizationPopup: Window | null = null
  #currentWorkspaceId: string | null = null
  readonly #connectorForms = new Map<string, FormRecord<FormControl<string>>>()

  constructor() {
    this.#destroyRef.onDestroy(() => this.clearAuthorizationPolling())

    effect(() => {
      const workspaceId = this.workspaceId()
      this.reloadKey()
      if ((workspaceId ?? null) !== this.#currentWorkspaceId) {
        this.#currentWorkspaceId = workspaceId ?? null
        this.clearAuthorizationPolling()
        this.pendingAuthorizationUrls.set({})
      }
      if (workspaceId) {
        void this.load(workspaceId)
      }
    })
  }

  async load(workspaceId: string) {
    this.loading.set(true)
    try {
      const [definitions, connectors] = await Promise.all([
        firstValueFrom(this.#connectorService.definitions(workspaceId)),
        firstValueFrom(this.#connectorService.list(workspaceId))
      ])

      this.definitions.set(definitions)
      this.connectors.set(connectors)
      this.prepareConnectorForms(definitions, connectors)
      await this.recoverPendingAuthorizations(workspaceId, connectors)
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.loading.set(false)
    }
  }

  async connect(definition: ConnectorStrategyDefinition) {
    const workspaceId = this.workspaceId()
    if (!workspaceId || !definition || !this.canManageWorkspace()) {
      return
    }

    if (this.connectorFor(definition)?.status === 'active') {
      return
    }

    const form = this.formFor(definition)
    form.markAllAsTouched()
    if (form.invalid) {
      this.#toastr.error('PAC.Xpert.ConnectorCredentialsRequired', 'PAC.TOASTR.TITLE.ERROR', {
        Default: 'Complete the required authentication fields before connecting.'
      })
      return
    }

    const authMethod = this.selectedAuthMethod(definition)
    if (!authMethod) {
      return
    }

    const hasAuthorizationPopup = !!this.#authorizationPopup && !this.#authorizationPopup.closed
    const reservedPopup = authMethod.type === 'oauth2' && !hasAuthorizationPopup ? this.openAuthorizationPopup() : null
    this.connectingProvider.set(definition.provider)
    try {
      const values = this.connectorValues(definition, authMethod)
      const response = await firstValueFrom(
        this.#connectorService.connect(workspaceId, definition.provider, {
          authMethodId: authMethod.id,
          ...(values ? { values } : {})
        })
      )
      this.upsertConnector(response.connector)
      if (response.status === 'active') {
        this.closeReservedAuthorizationPopup(reservedPopup)
        this.reloadKey.update((value) => value + 1)
        return
      }

      if (response.authorizationUrl) {
        this.openAuthorizationUrl(response.authorizationUrl)
      }
      if (response.connector?.id && response.authorizationUrl) {
        this.setPendingAuthorizationUrl(response.connector.id, response.authorizationUrl)
        this.startAuthorizationPolling(workspaceId, response.connector.id, response.pollIntervalSeconds ?? 5)
      }
    } catch (error) {
      this.closeReservedAuthorizationPopup(reservedPopup)
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.connectingProvider.set(null)
    }
  }

  async disconnect(connector: ConnectorInstance) {
    const workspaceId = this.workspaceId()
    if (!workspaceId || !connector || !this.canManageWorkspace()) {
      return
    }

    this.disconnectingConnectorId.set(connector.id)
    try {
      await firstValueFrom(this.#connectorService.disconnect(workspaceId, connector.id))
      this.clearPendingAuthorizationUrl(connector.id)
      this.reloadKey.update((value) => value + 1)
      this.#toastr.success('PAC.Messages.UpdatedSuccessfully', { Default: 'Updated successfully' })
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.disconnectingConnectorId.set(null)
    }
  }

  connectorFor(definition: ConnectorStrategyDefinition) {
    return this.connectors().find((item) => item.provider === definition.provider) ?? null
  }

  authMethodsFor(definition: ConnectorStrategyDefinition): ConnectorAuthMethodDefinition[] {
    return getConnectorAuthMethods(definition)
  }

  formFor(definition: ConnectorStrategyDefinition) {
    let form = this.#connectorForms.get(definition.provider)
    if (!form) {
      form = this.createConnectorForm(definition, this.connectorFor(definition))
      this.#connectorForms.set(definition.provider, form)
    }
    return form
  }

  selectedAuthMethod(definition: ConnectorStrategyDefinition) {
    const authMethodId = this.formFor(definition).controls.authMethodId?.value
    return this.authMethodsFor(definition).find((method) => method.id === authMethodId) ?? null
  }

  selectAuthMethod(definition: ConnectorStrategyDefinition, value: unknown) {
    const authMethodId = typeof value === 'string' ? value : null
    if (!authMethodId) {
      return
    }
    const method = this.authMethodsFor(definition).find((item) => item.id === authMethodId)
    if (!method) {
      return
    }
    const form = this.formFor(definition)
    form.controls.authMethodId?.setValue(authMethodId)
    this.configureCredentialControls(form, method)
  }

  credentialFormFor(method?: ConnectorAuthMethodDefinition | null): ConnectorCredentialFormDefinition | undefined {
    if (!method) {
      return undefined
    }
    return method.type === 'oauth2' ? method.appCredentials : method.credentials
  }

  credentialFieldsFor(method?: ConnectorAuthMethodDefinition | null) {
    return this.credentialFormFor(method)?.fields ?? []
  }

  fieldControl(definition: ConnectorStrategyDefinition, field: ConnectorAppCredentialField) {
    return this.formFor(definition).controls[field.name]
  }

  statusLabelFor(connector?: ConnectorInstance | null) {
    return connectorStatusLabel(connector)
  }

  statusBadgeType(connector?: ConnectorInstance | null) {
    switch (connector?.status) {
      case 'active':
        return 'default'
      case 'error':
        return 'destructive'
      case 'pending':
      case 'expired':
        return 'secondary'
      default:
        return 'outline'
    }
  }

  iconImageUrl(definition: ConnectorStrategyDefinition) {
    return definition.icon?.type === 'image' && typeof definition.icon.value === 'string' ? definition.icon.value : null
  }

  isConnecting(definition: ConnectorStrategyDefinition) {
    return this.connectingProvider() === definition.provider
  }

  isPolling(connector?: ConnectorInstance | null) {
    return !!connector?.id && this.pollingConnectorId() === connector.id
  }

  isDisconnecting(connector: ConnectorInstance) {
    return this.disconnectingConnectorId() === connector.id
  }

  pendingAuthorizationUrl(connector?: ConnectorInstance | null) {
    return connector?.id ? this.pendingAuthorizationUrls()[connector.id] : ''
  }

  openPendingAuthorizationUrl(connector: ConnectorInstance) {
    const authorizationUrl = this.pendingAuthorizationUrl(connector)
    if (authorizationUrl) {
      this.openAuthorizationUrl(authorizationUrl)
    }
  }

  private openAuthorizationUrl(authorizationUrl: string) {
    if (!authorizationUrl) {
      this.reloadKey.update((value) => value + 1)
      return
    }

    const popup = this.openAuthorizationPopup()
    if (popup) {
      popup.location.href = authorizationUrl
      popup.focus()
      return
    }

    this.#toastr.error('PAC.Xpert.ConnectorAuthorizationPopupBlocked', 'PAC.TOASTR.TITLE.ERROR', {
      Default: 'Authorization page was blocked. Allow pop-ups for this site and try again.'
    })
  }

  private prepareConnectorForms(definitions: ConnectorStrategyDefinition[], connectors: ConnectorInstance[]) {
    this.#connectorForms.clear()
    for (const definition of definitions) {
      const connector = connectors.find((item) => item.provider === definition.provider) ?? null
      this.#connectorForms.set(definition.provider, this.createConnectorForm(definition, connector))
    }
  }

  private createConnectorForm(definition: ConnectorStrategyDefinition, connector?: ConnectorInstance | null) {
    const methods = this.authMethodsFor(definition)
    const selectedMethod = methods.find((method) => method.id === connector?.authMethodId) ?? methods[0]
    const form = new FormRecord<FormControl<string>>({
      authMethodId: new FormControl(selectedMethod?.id ?? '', {
        nonNullable: true,
        validators: [Validators.required]
      })
    })
    if (selectedMethod) {
      this.configureCredentialControls(form, selectedMethod)
    }
    return form
  }

  private configureCredentialControls(form: FormRecord<FormControl<string>>, method: ConnectorAuthMethodDefinition) {
    for (const name of Object.keys(form.controls)) {
      if (name !== 'authMethodId') {
        form.removeControl(name)
      }
    }

    const credentialForm = this.credentialFormFor(method)
    for (const field of credentialForm?.fields ?? []) {
      const defaultValue = credentialForm?.defaultValues?.[field.name]
      form.addControl(
        field.name,
        new FormControl(defaultValue == null ? '' : String(defaultValue), {
          nonNullable: true,
          validators: field.required ? [Validators.required] : []
        })
      )
    }
  }

  private connectorValues(definition: ConnectorStrategyDefinition, method: ConnectorAuthMethodDefinition) {
    const values: Record<string, unknown> = {}
    for (const field of this.credentialFieldsFor(method)) {
      const value = this.formFor(definition).controls[field.name]?.value
      if (value !== undefined && value !== '') {
        values[field.name] = value
      }
    }
    return Object.keys(values).length ? values : undefined
  }

  private openAuthorizationPopup() {
    if (this.#authorizationPopup && !this.#authorizationPopup.closed) {
      return this.#authorizationPopup
    }

    const popup = window.open('', '_blank')
    if (popup) {
      this.#authorizationPopup = popup
      popup.opener = null
    }

    return popup
  }

  private closeReservedAuthorizationPopup(popup: Window | null) {
    if (!popup || this.#authorizationPopup !== popup) {
      return
    }

    if (!popup.closed) {
      popup.close()
    }
    this.#authorizationPopup = null
  }

  private startAuthorizationPolling(workspaceId: string, connectorId: string, intervalSeconds: number) {
    this.clearAuthorizationPolling()
    this.pollingConnectorId.set(connectorId)
    this.#authorizationPollTimer = setTimeout(
      () => void this.pollAuthorization(workspaceId, connectorId),
      Math.max(2_000, intervalSeconds * 1_000)
    )
  }

  private async pollAuthorization(workspaceId: string, connectorId: string) {
    try {
      const response = await firstValueFrom(this.#connectorService.pollAuthorization(workspaceId, connectorId))
      this.upsertConnector(response.connector)
      if (response.authorizationUrl) {
        const currentAuthorizationUrl = this.pendingAuthorizationUrls()[connectorId]
        this.setPendingAuthorizationUrl(connectorId, response.authorizationUrl)
        if (response.authorizationUrl !== currentAuthorizationUrl) {
          this.openAuthorizationUrl(response.authorizationUrl)
        }
      }

      if (response.connector.status === 'pending') {
        this.startAuthorizationPolling(workspaceId, connectorId, response.pollIntervalSeconds ?? 5)
        return
      }

      this.clearAuthorizationPolling()
      this.clearPendingAuthorizationUrl(connectorId)
      this.reloadKey.update((value) => value + 1)
    } catch (error) {
      this.clearAuthorizationPolling()
      this.#toastr.error(getErrorMessage(error))
    }
  }

  private async recoverPendingAuthorizations(workspaceId: string, connectors: ConnectorInstance[]) {
    if (!this.canManageWorkspace()) {
      return
    }

    const pendingConnector = connectors.find((connector) => connector.status === 'pending')
    if (!pendingConnector?.id || this.pollingConnectorId() === pendingConnector.id) {
      return
    }

    await this.pollAuthorization(workspaceId, pendingConnector.id)
  }

  private clearAuthorizationPolling() {
    if (this.#authorizationPollTimer) {
      clearTimeout(this.#authorizationPollTimer)
      this.#authorizationPollTimer = null
    }
    this.pollingConnectorId.set(null)
  }

  private setPendingAuthorizationUrl(connectorId: string, authorizationUrl: string) {
    if (!authorizationUrl) {
      return
    }
    this.pendingAuthorizationUrls.update((urls) => ({ ...urls, [connectorId]: authorizationUrl }))
  }

  private clearPendingAuthorizationUrl(connectorId: string) {
    this.pendingAuthorizationUrls.update((urls) => {
      const { [connectorId]: _removed, ...rest } = urls
      return rest
    })
  }

  private upsertConnector(connector: ConnectorInstance) {
    this.connectors.update((connectors) => {
      const index = connectors.findIndex((item) => item.id === connector.id)
      if (index < 0) {
        return [...connectors, connector]
      }
      return connectors.map((item) => (item.id === connector.id ? connector : item))
    })
  }
}

function connectorStatusLabel(connector?: ConnectorInstance | null): ConnectorStatusLabel {
  switch (connector?.status) {
    case 'active':
      return { key: 'PAC.Xpert.ConnectorStatusConnected', defaultLabel: 'Connected' }
    case 'pending':
      return { key: 'PAC.Xpert.ConnectorStatusPending', defaultLabel: 'Pending' }
    case 'expired':
      return { key: 'PAC.Xpert.ConnectorStatusExpired', defaultLabel: 'Expired' }
    case 'error':
      return { key: 'PAC.Xpert.ConnectorStatusError', defaultLabel: 'Error' }
    case 'disconnected':
      return { key: 'PAC.Xpert.ConnectorStatusDisconnected', defaultLabel: 'Disconnected' }
    default:
      return { key: 'PAC.Xpert.ConnectorStatusNotConnected', defaultLabel: 'Not connected' }
  }
}
