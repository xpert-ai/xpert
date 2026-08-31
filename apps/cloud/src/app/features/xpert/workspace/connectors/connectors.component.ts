import { Clipboard } from '@angular/cdk/clipboard'
import { Component, DestroyRef, HostListener, computed, effect, inject, signal } from '@angular/core'
import { FormControl, FormRecord, ReactiveFormsModule, Validators } from '@angular/forms'
import {
  ZardButtonComponent,
  ZardFormImports,
  ZardIconComponent,
  ZardInputDirective,
  ZardSelectImports
} from '@xpert-ai/headless-ui'
import { XpI18nPipe } from '@xpert-ai/headless-ui'
import { TranslateModule } from '@ngx-translate/core'
import { getConnectorAuthMethods } from '@xpert-ai/plugin-sdk/connector'
import type {
  ConnectorAppCredentialField,
  ConnectorAuthMethodDefinition,
  ConnectorCredentialFormDefinition,
  ConnectorInstance,
  ConnectorStrategyDefinition
} from '@xpert-ai/plugin-sdk/connector'
import { AlertCircle, Cable, Link2Off, LoaderCircle } from 'lucide-angular'
import { firstValueFrom } from 'rxjs'
import { getErrorMessage, injectToastr, XpertConnectorService, XpertWorkspaceService } from 'apps/cloud/src/app/@core'
import { IconComponent } from 'apps/cloud/src/app/@shared/avatar'
import { IntegrationSelectComponent } from 'apps/cloud/src/app/@shared/integration'
import { QRCodeComponent } from 'apps/cloud/src/app/@shared/qrcode'
import { XpertWorkspaceHomeComponent } from '../home/home.component'

type ConnectorStatusLabel = {
  key: string
  defaultLabel: string
}

const EMBEDDED_QR_AUTHORIZATIONS = new Set(['wecom:wecom-qr', 'wecom:wecom-cli-qr'])

@Component({
  selector: 'xpert-connectors',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    TranslateModule,
    XpI18nPipe,
    IconComponent,
    IntegrationSelectComponent,
    QRCodeComponent,
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
  readonly #clipboard = inject(Clipboard)
  readonly #toastr = injectToastr()
  readonly #destroyRef = inject(DestroyRef)

  readonly homeComponent = inject(XpertWorkspaceHomeComponent)
  readonly workspace = this.homeComponent.workspace
  readonly workspaceId = computed(() => this.workspace()?.id)
  readonly canManageWorkspace = computed(() => this.#workspaceService.canManage(this.workspace()))

  readonly definitions = signal<ConnectorStrategyDefinition[]>([])
  readonly connectors = signal<ConnectorInstance[]>([])
  readonly searchQuery = this.homeComponent.connectorSearchQuery
  readonly selectedProvider = signal<string | null>(null)
  readonly filteredDefinitions = computed(() => {
    const query = this.searchQuery().trim().toLocaleLowerCase()
    if (!query) {
      return this.definitions()
    }

    return this.definitions().filter((definition) => {
      const searchableText = [
        definition.provider,
        this.searchableText(definition.label),
        this.searchableText(this.descriptionFor(definition))
      ]
        .join(' ')
        .toLocaleLowerCase()
      return searchableText.includes(query)
    })
  })
  readonly selectedDefinition = computed(() => {
    const provider = this.selectedProvider()
    return provider ? (this.definitions().find((definition) => definition.provider === provider) ?? null) : null
  })
  readonly loading = signal(false)
  readonly errorMessage = signal<string | null>(null)
  readonly connectingProvider = signal<string | null>(null)
  readonly pollingConnectorId = signal<string | null>(null)
  readonly disconnectingConnectorId = signal<string | null>(null)
  readonly pendingAuthorizationUrls = signal<Record<string, string>>({})
  readonly reloadKey = signal(0)
  readonly skeletonCards = [0, 1, 2, 3]
  readonly connectorIcon = Cable
  readonly errorIcon = AlertCircle
  readonly loadingIcon = LoaderCircle
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
    this.errorMessage.set(null)
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
      const message = getErrorMessage(error)
      this.errorMessage.set(message)
      this.#toastr.error(message)
    } finally {
      this.loading.set(false)
    }
  }

  openConnectorDialog(definition: ConnectorStrategyDefinition) {
    this.selectedProvider.set(definition.provider)
  }

  async quickConnect(definition: ConnectorStrategyDefinition) {
    const authMethod = this.selectedAuthMethod(definition)
    if (this.credentialFieldsFor(authMethod).length || this.usesEmbeddedAuthorization(definition, authMethod)) {
      this.openConnectorDialog(definition)
    }

    if (this.credentialFieldsFor(authMethod).length) {
      return
    }

    await this.connect(definition)
  }

  closeConnectorDialog() {
    this.selectedProvider.set(null)
  }

  @HostListener('document:keydown.escape')
  closeConnectorDialogOnEscape() {
    if (this.selectedProvider()) {
      this.closeConnectorDialog()
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
      this.#toastr.error('XP.Xpert.ConnectorCredentialsRequired', 'XP.TOASTR.TITLE.ERROR', {
        Default: 'Complete the required authentication fields before connecting.'
      })
      return
    }

    const authMethod = this.selectedAuthMethod(definition)
    if (!authMethod) {
      return
    }

    const usesEmbeddedAuthorization = this.usesEmbeddedAuthorization(definition, authMethod)
    const hasAuthorizationPopup = !!this.#authorizationPopup && !this.#authorizationPopup.closed
    const reservedPopup =
      authMethod.type === 'oauth2' && !usesEmbeddedAuthorization && !hasAuthorizationPopup
        ? this.openAuthorizationPopup()
        : null
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
        if (usesEmbeddedAuthorization && this.selectedProvider() === definition.provider) {
          this.closeConnectorDialog()
        }
        this.reloadKey.update((value) => value + 1)
        return
      }

      if (response.connector?.id && response.authorizationUrl) {
        this.setPendingAuthorizationUrl(response.connector.id, response.authorizationUrl)
        this.startAuthorizationPolling(workspaceId, response.connector.id, response.pollIntervalSeconds ?? 5)
      }
      if (response.authorizationUrl) {
        if (usesEmbeddedAuthorization) {
          this.openConnectorDialog(definition)
        } else {
          this.openAuthorizationUrl(response.authorizationUrl)
        }
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

    const isPendingAuthorization = connector.status === 'pending'
    if (isPendingAuthorization) {
      this.clearAuthorizationPolling()
      this.clearPendingAuthorizationUrl(connector.id)
      this.closeAuthorizationPopup()
    }

    this.disconnectingConnectorId.set(connector.id)
    try {
      const request = isPendingAuthorization
        ? this.#connectorService.cancelAuthorization(workspaceId, connector.id)
        : this.#connectorService.disconnect(workspaceId, connector.id)
      await firstValueFrom(request)
      this.clearPendingAuthorizationUrl(connector.id)
      if (this.selectedProvider() === connector.provider) {
        this.closeConnectorDialog()
      }
      this.reloadKey.update((value) => value + 1)
      this.#toastr.success(
        isPendingAuthorization ? 'XP.Xpert.ConnectorAuthorizationCancelled' : 'XP.Messages.UpdatedSuccessfully',
        { Default: isPendingAuthorization ? 'Authorization cancelled.' : 'Updated successfully' }
      )
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.disconnectingConnectorId.set(null)
    }
  }

  connectorFor(definition: ConnectorStrategyDefinition) {
    return (
      this.connectors().find((item) => item.provider === definition.provider && item.status !== 'disconnected') ?? null
    )
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

  statusDotClass(connector?: ConnectorInstance | null) {
    switch (connector?.status) {
      case 'active':
        return 'bg-[var(--color-status-success-indicator-bg)]'
      case 'pending':
      case 'expired':
        return 'bg-[var(--color-status-warning-indicator-bg)]'
      case 'error':
        return 'bg-[var(--color-status-error-indicator-bg)]'
      default:
        return 'bg-text-tertiary'
    }
  }

  descriptionFor(definition: ConnectorStrategyDefinition) {
    return definition.description ?? definition.provider
  }

  profileLabel(connector: ConnectorInstance) {
    const profile = connector.profile
    return profile?.name || profile?.email || profile?.openId || connector.id
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

  authMethodForConnector(definition: ConnectorStrategyDefinition, connector?: ConnectorInstance | null) {
    return (
      this.authMethodsFor(definition).find((method) => method.id === connector?.authMethodId) ??
      this.selectedAuthMethod(definition)
    )
  }

  usesEmbeddedAuthorization(
    definition: ConnectorStrategyDefinition,
    authMethod?: ConnectorAuthMethodDefinition | null
  ) {
    return authMethod?.type === 'oauth2' && EMBEDDED_QR_AUTHORIZATIONS.has(`${definition.provider}:${authMethod.id}`)
  }

  openPendingAuthorizationUrl(connector: ConnectorInstance) {
    const definition = this.definitionForConnector(connector)
    if (definition && this.usesEmbeddedAuthorization(definition, this.authMethodForConnector(definition, connector))) {
      this.openConnectorDialog(definition)
      return
    }

    const authorizationUrl = this.pendingAuthorizationUrl(connector)
    if (authorizationUrl) {
      this.openAuthorizationUrl(authorizationUrl)
    }
  }

  copyPendingAuthorizationUrl(connector?: ConnectorInstance | null) {
    const authorizationUrl = this.pendingAuthorizationUrl(connector)
    if (!authorizationUrl) {
      return
    }

    if (this.#clipboard.copy(authorizationUrl)) {
      this.#toastr.success('XP.Messages.CopiedToClipboard', { Default: 'Copied to clipboard' })
      return
    }

    this.#toastr.error('XP.Xpert.ConnectorCopyAuthorizationUrlFailed', 'XP.TOASTR.TITLE.ERROR', {
      Default: 'Could not copy authorization link.'
    })
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

    this.#toastr.error('XP.Xpert.ConnectorAuthorizationPopupBlocked', 'XP.TOASTR.TITLE.ERROR', {
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

  private searchableText(value: unknown): string {
    if (typeof value === 'string') {
      return value
    }
    if (value && typeof value === 'object') {
      return Object.values(value)
        .filter((item): item is string => typeof item === 'string')
        .join(' ')
    }
    return ''
  }

  private definitionForConnector(connector: ConnectorInstance) {
    return this.definitions().find((definition) => definition.provider === connector.provider) ?? null
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

  private closeAuthorizationPopup() {
    const popup = this.#authorizationPopup
    if (popup && !popup.closed) {
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
      const definition = this.definitionForConnector(response.connector)
      const usesEmbeddedAuthorization =
        definition !== null &&
        this.usesEmbeddedAuthorization(definition, this.authMethodForConnector(definition, response.connector))
      if (response.authorizationUrl) {
        const currentAuthorizationUrl = this.pendingAuthorizationUrls()[connectorId]
        this.setPendingAuthorizationUrl(connectorId, response.authorizationUrl)
        if (response.authorizationUrl !== currentAuthorizationUrl && !usesEmbeddedAuthorization) {
          this.openAuthorizationUrl(response.authorizationUrl)
        }
      }

      if (response.connector.status === 'pending') {
        this.startAuthorizationPolling(workspaceId, connectorId, response.pollIntervalSeconds ?? 5)
        return
      }

      this.clearAuthorizationPolling()
      this.clearPendingAuthorizationUrl(connectorId)
      this.closeAuthorizationPopup()
      if (this.selectedProvider() === response.connector.provider) {
        this.closeConnectorDialog()
      }
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

@Component({
  selector: 'xpert-clawxpert-connectors',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    TranslateModule,
    XpI18nPipe,
    IconComponent,
    IntegrationSelectComponent,
    QRCodeComponent,
    ZardButtonComponent,
    ZardIconComponent,
    ZardInputDirective,
    ...ZardFormImports,
    ...ZardSelectImports
  ],
  templateUrl: './connectors.component.html'
})
export class ClawXpertConnectorsComponent extends XpertConnectorsComponent {}

function connectorStatusLabel(connector?: ConnectorInstance | null): ConnectorStatusLabel {
  switch (connector?.status) {
    case 'active':
      return { key: 'XP.Xpert.ConnectorStatusConnected', defaultLabel: 'Connected' }
    case 'pending':
      return { key: 'XP.Xpert.ConnectorStatusPending', defaultLabel: 'Pending' }
    case 'expired':
      return { key: 'XP.Xpert.ConnectorStatusExpired', defaultLabel: 'Expired' }
    case 'error':
      return { key: 'XP.Xpert.ConnectorStatusError', defaultLabel: 'Error' }
    case 'disconnected':
      return { key: 'XP.Xpert.ConnectorStatusDisconnected', defaultLabel: 'Disconnected' }
    default:
      return { key: 'XP.Xpert.ConnectorStatusNotConnected', defaultLabel: 'Not connected' }
  }
}
