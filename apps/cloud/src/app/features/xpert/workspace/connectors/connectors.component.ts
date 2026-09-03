import { Clipboard } from '@angular/cdk/clipboard'
import { Component, DestroyRef, HostListener, computed, effect, inject, signal } from '@angular/core'
import { FormControl, FormRecord, ReactiveFormsModule, Validators } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { resolveI18nText } from '@xpert-ai/contracts'
import { getConnectorAuthMethods } from '@xpert-ai/plugin-sdk/connector'
import type {
  ConnectorAppCredentialField,
  ConnectorAuthMethodDefinition,
  ConnectorAuthorizationPresentation,
  ConnectorBinding,
  ConnectorCredentialFormDefinition,
  ConnectorInstance,
  ConnectorStrategyDefinition
} from '@xpert-ai/plugin-sdk/connector'
import {
  XpI18nPipe,
  XpSpinComponent,
  ZardButtonComponent,
  ZardFormImports,
  ZardIconComponent,
  ZardInputDirective,
  ZardSelectImports
} from '@xpert-ai/headless-ui'
import { AlertCircle, Cable, Link2Off, LoaderCircle, RefreshCw } from 'lucide-angular'
import { firstValueFrom } from 'rxjs'
import { getErrorMessage, injectToastr, XpertConnectorService, XpertWorkspaceService } from 'apps/cloud/src/app/@core'
import { IconComponent } from 'apps/cloud/src/app/@shared/avatar'
import { QRCodeComponent } from 'apps/cloud/src/app/@shared/qrcode'
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
    XpI18nPipe,
    XpSpinComponent,
    IconComponent,
    QRCodeComponent,
    ZardButtonComponent,
    ZardIconComponent,
    ZardInputDirective,
    ...ZardFormImports,
    ...ZardSelectImports
  ],
  templateUrl: './workspace-connectors.component.html'
})
export class XpertConnectorsComponent {
  readonly #connectorService = inject(XpertConnectorService)
  readonly #workspaceService = inject(XpertWorkspaceService)
  readonly #clipboard = inject(Clipboard)
  readonly #translate = inject(TranslateService)
  readonly #toastr = injectToastr()
  readonly #destroyRef = inject(DestroyRef)

  readonly homeComponent = inject(XpertWorkspaceHomeComponent)
  readonly workspace = this.homeComponent.workspace
  readonly workspaceId = computed(() => this.workspace()?.id)
  readonly canManageWorkspace = computed(() => this.#workspaceService.canManage(this.workspace()))

  readonly definitions = signal<ConnectorStrategyDefinition[]>([])
  readonly bindings = signal<ConnectorBinding[]>([])
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
  readonly connectingBindingId = signal<string | null>(null)
  readonly disconnectingBindingId = signal<string | null>(null)
  readonly cancellingBindingId = signal<string | null>(null)
  readonly pendingAuthorizationUrls = signal<Record<string, string>>({})
  readonly reloadKey = signal(0)
  readonly skeletonCards = [0, 1, 2, 3]
  readonly connectorIcon = Cable
  readonly refreshIcon = RefreshCw
  readonly disconnectIcon = Link2Off
  readonly errorIcon = AlertCircle
  readonly loadingIcon = LoaderCircle
  readonly #connectorForms = new Map<string, FormRecord<FormControl<string>>>()
  readonly #authorizationPollTimers = new Map<string, ReturnType<typeof setTimeout>>()
  readonly #authorizationPopups = new Map<string, Window>()
  #currentWorkspaceId: string | null = null

  constructor() {
    this.#destroyRef.onDestroy(() => {
      this.clearAuthorizationPolling()
      this.closeAllAuthorizationPopups()
    })

    effect(() => {
      const workspaceId = this.workspaceId()
      this.reloadKey()
      if ((workspaceId ?? null) !== this.#currentWorkspaceId) {
        this.#currentWorkspaceId = workspaceId ?? null
        this.clearAuthorizationPolling()
        this.closeAllAuthorizationPopups()
        this.pendingAuthorizationUrls.set({})
        this.#connectorForms.clear()
        this.selectedProvider.set(null)
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
      const [definitions, bindings] = await Promise.all([
        firstValueFrom(this.#connectorService.scopedDefinitions('workspace', workspaceId)),
        firstValueFrom(this.#connectorService.listBindings('workspace', workspaceId))
      ])
      if (this.workspaceId() && this.workspaceId() !== workspaceId) {
        return
      }

      this.definitions.set(definitions)
      this.bindings.set(bindings)
      this.prepareConnectorForms(definitions, bindings)
      await this.recoverPendingAuthorizations(workspaceId, bindings)
    } catch (error) {
      const message = getErrorMessage(error)
      this.errorMessage.set(message)
      this.#toastr.error(message)
    } finally {
      this.loading.set(false)
    }
  }

  refresh() {
    if (this.workspaceId()) {
      this.reloadKey.update((value) => value + 1)
    }
  }

  openConnectorDialog(definition: ConnectorStrategyDefinition) {
    this.selectedProvider.set(definition.provider)
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

  quickConnect(definition: ConnectorStrategyDefinition) {
    const binding = this.bindingFor(definition)
    if (binding?.status === 'active') {
      this.openConnectorDialog(definition)
      return
    }

    const authMethod = this.selectedAuthMethod(binding, definition)
    if (!authMethod || this.formFor(binding, definition).invalid) {
      this.openConnectorDialog(definition)
      return
    }

    void this.connect(binding, definition)
  }

  bindingFor(definition: ConnectorStrategyDefinition) {
    return this.bindings().find((binding) => binding.provider === definition.provider) ?? null
  }

  async connect(binding: ConnectorBinding | null, definition: ConnectorStrategyDefinition) {
    const workspaceId = this.workspaceId()
    if (!workspaceId || !this.canManageWorkspace()) {
      return
    }

    const form = this.formFor(binding, definition)
    form.markAllAsTouched()
    if (form.invalid) {
      this.#toastr.error('XP.Xpert.ConnectorCredentialsRequired', 'XP.TOASTR.TITLE.ERROR', {
        Default: 'Complete the required authentication fields before connecting.'
      })
      return
    }

    const authMethod = this.selectedAuthMethod(binding, definition)
    if (!authMethod) {
      return
    }

    const usesEmbeddedAuthorization = this.usesEmbeddedAuthorization(authMethod)
    const connectionKey = binding?.id ?? definition.provider
    const reservedPopup =
      authMethod.type === 'oauth2' && !usesEmbeddedAuthorization ? this.openAuthorizationPopup(connectionKey) : null
    this.connectingBindingId.set(connectionKey)
    try {
      const values = this.connectorValues(binding, definition, authMethod)
      const input = {
        authMethodId: authMethod.id,
        ...(values ? { values } : {})
      }
      const response = await firstValueFrom(
        binding
          ? this.#connectorService.connectBinding(binding.id, input)
          : this.#connectorService.connect(workspaceId, definition.provider, input)
      )
      const connectedBinding = binding
        ? this.bindingState(binding, response.connector)
        : this.workspaceBinding(response.connector, workspaceId)
      this.upsertBinding(connectedBinding)
      this.moveAuthorizationPopup(connectionKey, connectedBinding.id, reservedPopup)
      if (response.status === 'active') {
        this.closeReservedAuthorizationPopup(connectedBinding.id, reservedPopup)
        await this.reloadCurrentWorkspace()
        if (this.selectedProvider() === definition.provider) {
          this.closeConnectorDialog()
        }
        return
      }

      if (response.authorizationUrl) {
        this.setPendingAuthorizationUrl(connectedBinding.id, response.authorizationUrl)
        this.startAuthorizationPolling(connectedBinding.id, response.pollIntervalSeconds ?? 5)
        if (usesEmbeddedAuthorization) {
          this.openConnectorDialog(definition)
        } else {
          this.openAuthorizationUrl(connectedBinding.id, response.authorizationUrl)
        }
      }
    } catch (error) {
      this.closeReservedAuthorizationPopup(connectionKey, reservedPopup)
      if (!binding) {
        await this.reloadCurrentWorkspace()
      }
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.connectingBindingId.set(null)
    }
  }

  async cancelAuthorization(binding: ConnectorBinding) {
    if (!this.canManageWorkspace() || binding.status !== 'pending') {
      return
    }

    this.cancellingBindingId.set(binding.id)
    try {
      await firstValueFrom(this.#connectorService.cancelBindingAuthorization(binding.id))
      this.clearPendingAuthorization(binding.id)
      this.closeAuthorizationPopup(binding.id)
      await this.reloadCurrentWorkspace()
      if (this.selectedProvider() === binding.provider) {
        this.closeConnectorDialog()
      }
      this.#toastr.success('XP.Xpert.ConnectorAuthorizationCancelled', {
        Default: 'Authorization cancelled.'
      })
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.cancellingBindingId.set(null)
    }
  }

  async disconnect(binding: ConnectorBinding) {
    const workspaceId = this.workspaceId()
    if (!workspaceId || !this.canManageWorkspace()) {
      return
    }

    this.disconnectingBindingId.set(binding.id)
    try {
      await firstValueFrom(this.#connectorService.disconnect(workspaceId, binding.id))
      this.clearPendingAuthorization(binding.id)
      this.closeAuthorizationPopup(binding.id)
      await this.reloadCurrentWorkspace()
      if (this.selectedProvider() === binding.provider) {
        this.closeConnectorDialog()
      }
      this.#toastr.success('XP.Messages.UpdatedSuccessfully', { Default: 'Updated successfully' })
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.disconnectingBindingId.set(null)
    }
  }

  authMethodsFor(definition: ConnectorStrategyDefinition): ConnectorAuthMethodDefinition[] {
    return getConnectorAuthMethods(definition)
  }

  formFor(binding: ConnectorBinding | null | undefined, definition: ConnectorStrategyDefinition) {
    let form = this.#connectorForms.get(definition.provider)
    if (!form) {
      form = this.createConnectorForm(definition, binding)
      this.#connectorForms.set(definition.provider, form)
    }
    return form
  }

  selectedAuthMethod(binding: ConnectorBinding | null | undefined, definition: ConnectorStrategyDefinition) {
    const authMethodId = this.formFor(binding, definition).controls.authMethodId?.value
    return this.authMethodsFor(definition).find((method) => method.id === authMethodId) ?? null
  }

  selectAuthMethod(
    binding: ConnectorBinding | null | undefined,
    definition: ConnectorStrategyDefinition,
    value: unknown
  ) {
    const authMethodId = normalizeSelection(value)
    if (!authMethodId) {
      return
    }
    const method = this.authMethodsFor(definition).find((item) => item.id === authMethodId)
    if (!method) {
      return
    }
    const form = this.formFor(binding, definition)
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

  fieldControl(
    binding: ConnectorBinding | null | undefined,
    definition: ConnectorStrategyDefinition,
    field: ConnectorAppCredentialField
  ) {
    return this.formFor(binding, definition).controls[field.name]
  }

  statusLabelFor(binding?: ConnectorBinding | null) {
    return connectorStatusLabel(binding)
  }

  statusBadgeType(binding?: ConnectorBinding | null) {
    switch (binding?.status) {
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

  statusDotClass(binding?: ConnectorBinding | null) {
    switch (binding?.status) {
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

  iconImageUrl(definition: ConnectorStrategyDefinition) {
    return definition.icon?.type === 'image' && typeof definition.icon.value === 'string' ? definition.icon.value : null
  }

  descriptionFor(definition: ConnectorStrategyDefinition) {
    return definition.description ?? definition.provider
  }

  profileLabel(binding: ConnectorBinding) {
    const profile = binding.profile
    return profile?.name || profile?.email || profile?.openId || binding.id
  }

  isConnecting(binding: ConnectorBinding | null | undefined, definition?: ConnectorStrategyDefinition) {
    return this.connectingBindingId() === (binding?.id ?? definition?.provider)
  }

  isDisconnecting(binding: ConnectorBinding) {
    return this.disconnectingBindingId() === binding.id
  }

  isCancelling(binding: ConnectorBinding) {
    return this.cancellingBindingId() === binding.id
  }

  isPolling(binding?: ConnectorBinding | null) {
    return !!binding?.id && this.#authorizationPollTimers.has(binding.id)
  }

  pendingAuthorizationUrl(binding?: ConnectorBinding | null) {
    return binding?.id ? this.pendingAuthorizationUrls()[binding.id] : ''
  }

  openPendingAuthorizationUrl(binding: ConnectorBinding) {
    const definition = this.definitionForBinding(binding)
    if (definition && this.usesEmbeddedAuthorization(this.authMethodForBinding(definition, binding))) {
      this.openConnectorDialog(definition)
      return
    }

    const authorizationUrl = this.pendingAuthorizationUrl(binding)
    if (authorizationUrl) {
      this.openAuthorizationUrl(binding.id, authorizationUrl)
    }
  }

  authMethodForBinding(definition: ConnectorStrategyDefinition, binding?: ConnectorBinding | null) {
    return (
      this.authMethodsFor(definition).find((method) => method.id === binding?.authMethodId) ??
      (binding ? this.selectedAuthMethod(binding, definition) : (this.authMethodsFor(definition)[0] ?? null))
    )
  }

  authorizationPresentationFor(authMethod?: ConnectorAuthMethodDefinition | null) {
    return authMethod?.type === 'oauth2' ? (authMethod.authorizationPresentation ?? null) : null
  }

  usesEmbeddedAuthorization(authMethod?: ConnectorAuthMethodDefinition | null) {
    return this.authorizationPresentationFor(authMethod)?.mode === 'embedded_qr'
  }

  copyPendingAuthorizationUrl(
    binding: ConnectorBinding | null | undefined,
    presentation: ConnectorAuthorizationPresentation
  ) {
    const authorizationUrl = this.pendingAuthorizationUrl(binding)
    if (!authorizationUrl) {
      return
    }

    if (this.#clipboard.copy(authorizationUrl)) {
      this.#toastr.success('XP.Messages.CopiedToClipboard', { Default: 'Copied to clipboard' })
      return
    }

    this.#toastr.error(
      resolveI18nText(presentation.copyLinkError, this.#translate.currentLang) ?? 'Could not copy authorization link.'
    )
  }

  private openAuthorizationUrl(bindingId: string, authorizationUrl: string) {
    if (!authorizationUrl) {
      return
    }

    const popup = this.openAuthorizationPopup(bindingId)
    if (popup) {
      popup.location.href = authorizationUrl
      popup.focus()
      return
    }

    this.#toastr.error('XP.Xpert.ConnectorAuthorizationPopupBlocked', 'XP.TOASTR.TITLE.ERROR', {
      Default: 'Authorization page was blocked. Allow pop-ups for this site and try again.'
    })
  }

  private prepareConnectorForms(definitions: ConnectorStrategyDefinition[], bindings: ConnectorBinding[]) {
    this.#connectorForms.clear()
    for (const definition of definitions) {
      const binding = bindings.find((item) => item.provider === definition.provider)
      this.#connectorForms.set(definition.provider, this.createConnectorForm(definition, binding))
    }
  }

  private createConnectorForm(definition: ConnectorStrategyDefinition, binding?: ConnectorBinding | null) {
    const methods = this.authMethodsFor(definition)
    const selectedMethod = methods.find((method) => method.id === binding?.authMethodId) ?? methods[0]
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
      const defaultValue = credentialForm.defaultValues?.[field.name]
      form.addControl(
        field.name,
        new FormControl(defaultValue == null ? '' : String(defaultValue), {
          nonNullable: true,
          validators: field.required ? [Validators.required] : []
        })
      )
    }
  }

  private connectorValues(
    binding: ConnectorBinding | null | undefined,
    definition: ConnectorStrategyDefinition,
    method: ConnectorAuthMethodDefinition
  ) {
    const values: Record<string, unknown> = {}
    for (const field of this.credentialFieldsFor(method)) {
      const value = this.formFor(binding, definition).controls[field.name]?.value
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

  private definitionForBinding(binding: ConnectorBinding) {
    return this.definitions().find((definition) => definition.provider === binding.provider) ?? null
  }

  private openAuthorizationPopup(bindingId: string) {
    const currentPopup = this.#authorizationPopups.get(bindingId)
    if (currentPopup && !currentPopup.closed) {
      return currentPopup
    }
    if (currentPopup) {
      this.#authorizationPopups.delete(bindingId)
    }

    const popup = window.open('', '_blank')
    if (popup) {
      this.#authorizationPopups.set(bindingId, popup)
      popup.opener = null
    }
    return popup
  }

  private closeReservedAuthorizationPopup(bindingId: string, popup: Window | null) {
    if (!popup || this.#authorizationPopups.get(bindingId) !== popup) {
      return
    }
    if (!popup.closed) {
      popup.close()
    }
    this.#authorizationPopups.delete(bindingId)
  }

  private moveAuthorizationPopup(fromKey: string, bindingId: string, popup: Window | null) {
    if (!popup || fromKey === bindingId || this.#authorizationPopups.get(fromKey) !== popup) {
      return
    }
    this.#authorizationPopups.delete(fromKey)
    this.#authorizationPopups.set(bindingId, popup)
  }

  private closeAuthorizationPopup(bindingId: string) {
    const popup = this.#authorizationPopups.get(bindingId)
    if (popup && !popup.closed) {
      popup.close()
    }
    this.#authorizationPopups.delete(bindingId)
  }

  private closeAllAuthorizationPopups() {
    for (const bindingId of this.#authorizationPopups.keys()) {
      this.closeAuthorizationPopup(bindingId)
    }
  }

  private startAuthorizationPolling(bindingId: string, intervalSeconds: number) {
    const current = this.#authorizationPollTimers.get(bindingId)
    if (current) {
      clearTimeout(current)
    }
    this.#authorizationPollTimers.set(
      bindingId,
      setTimeout(() => void this.pollAuthorization(bindingId), Math.max(2_000, intervalSeconds * 1_000))
    )
  }

  private async pollAuthorization(bindingId: string) {
    const binding = this.bindings().find((item) => item.id === bindingId)
    if (!binding || !this.canManageWorkspace()) {
      this.clearPendingAuthorization(bindingId)
      return
    }

    try {
      const response = await firstValueFrom(this.#connectorService.bindingAuthorizationStatus(bindingId))
      this.upsertBindingState(binding, response.connector)
      if (response.authorizationUrl) {
        this.setPendingAuthorizationUrl(bindingId, response.authorizationUrl)
      }

      if (response.connector.status === 'pending') {
        this.startAuthorizationPolling(bindingId, response.pollIntervalSeconds ?? 5)
        return
      }

      this.clearPendingAuthorization(bindingId)
      this.closeAuthorizationPopup(bindingId)
      await this.reloadCurrentWorkspace()
      if (this.selectedProvider() === binding.provider) {
        this.closeConnectorDialog()
      }
    } catch (error) {
      this.clearPendingAuthorization(bindingId)
      this.#toastr.error(getErrorMessage(error))
    }
  }

  private async recoverPendingAuthorizations(workspaceId: string, bindings: ConnectorBinding[]) {
    const pendingBinding = bindings.find(
      (binding) =>
        binding.status === 'pending' && this.canManageWorkspace() && !this.#authorizationPollTimers.has(binding.id)
    )
    if (pendingBinding && this.workspaceId() === workspaceId) {
      await this.pollAuthorization(pendingBinding.id)
    }
  }

  private clearAuthorizationPolling() {
    for (const timer of this.#authorizationPollTimers.values()) {
      clearTimeout(timer)
    }
    this.#authorizationPollTimers.clear()
  }

  private clearPendingAuthorization(bindingId: string) {
    const timer = this.#authorizationPollTimers.get(bindingId)
    if (timer) {
      clearTimeout(timer)
      this.#authorizationPollTimers.delete(bindingId)
    }
    this.pendingAuthorizationUrls.update((urls) => {
      const next = { ...urls }
      delete next[bindingId]
      return next
    })
  }

  private setPendingAuthorizationUrl(bindingId: string, authorizationUrl: string) {
    if (authorizationUrl) {
      this.pendingAuthorizationUrls.update((urls) => ({ ...urls, [bindingId]: authorizationUrl }))
    }
  }

  private upsertBinding(binding: ConnectorBinding) {
    this.bindings.update((bindings) => {
      const index = bindings.findIndex((item) => item.id === binding.id)
      return index < 0 ? [...bindings, binding] : bindings.map((item) => (item.id === binding.id ? binding : item))
    })
  }

  private bindingState(binding: ConnectorBinding, connector: ConnectorInstance): ConnectorBinding {
    return {
      ...binding,
      ...connector,
      scopeType: binding.scopeType,
      scope: binding.scope,
      authorizationMode: binding.authorizationMode
    }
  }

  private workspaceBinding(connector: ConnectorInstance, workspaceId: string): ConnectorBinding {
    return {
      ...connector,
      workspaceId,
      projectId: null,
      scopeType: 'workspace',
      scope: { type: 'workspace', workspaceId },
      authorizationMode: 'shared'
    }
  }

  private upsertBindingState(binding: ConnectorBinding, connector: ConnectorInstance) {
    this.upsertBinding(this.bindingState(binding, connector))
  }

  private async reloadCurrentWorkspace() {
    const workspaceId = this.workspaceId()
    if (workspaceId) {
      await this.load(workspaceId)
    }
  }
}

@Component({
  selector: 'xpert-clawxpert-connectors',
  standalone: true,
  imports: [XpertConnectorsComponent],
  templateUrl: './connectors.component.html'
})
export class ClawXpertConnectorsComponent {}

function connectorStatusLabel(binding?: ConnectorBinding | null): ConnectorStatusLabel {
  switch (binding?.status) {
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
      return { key: 'XP.Xpert.ConnectorStatusNotConnected', defaultLabel: 'Not configured' }
  }
}

function normalizeSelection(value: unknown) {
  const selected = Array.isArray(value) ? value[0] : value
  return typeof selected === 'string' || typeof selected === 'number' ? String(selected) : ''
}
