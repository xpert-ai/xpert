import { Component, DestroyRef, computed, inject, signal } from '@angular/core'
import { FormControl, FormRecord, ReactiveFormsModule, Validators } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { getConnectorAuthMethods, getConnectorAuthorizationModes } from '@xpert-ai/plugin-sdk/connector'
import type {
  ConnectorAuthMethodDefinition,
  ConnectorAuthorizationMode,
  ConnectorBinding,
  ConnectorCredentialFormDefinition,
  ConnectorStrategyDefinition
} from '@xpert-ai/plugin-sdk/connector'
import {
  XpI18nPipe,
  Z_MODAL_DATA,
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardDialogRef,
  ZardFormImports,
  ZardInputDirective,
  ZardSelectImports
} from '@xpert-ai/headless-ui'
import { firstValueFrom } from 'rxjs'
import { getErrorMessage, ToastrService, XpertConnectorService } from '../../@core'

type ProjectConnectorsDialogData = {
  projectId: string
  canManage: boolean
}

@Component({
  standalone: true,
  selector: 'xp-project-connectors-dialog',
  imports: [
    ReactiveFormsModule,
    TranslateModule,
    XpI18nPipe,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardInputDirective,
    ...ZardFormImports,
    ...ZardSelectImports
  ],
  template: `
    <section class="flex max-h-[86vh] min-w-0 flex-col">
      <header class="flex items-start justify-between border-b border-divider-subtle pb-4">
        <div>
          <h2 class="text-lg font-semibold text-text-primary">{{ 'XP.XProject.ProjectConnectors' | translate }}</h2>
          <p class="mt-1 text-sm text-text-secondary">{{ 'XP.XProject.ProjectConnectorsDescription' | translate }}</p>
        </div>
        <button z-button zType="ghost" zSize="sm" type="button" (click)="close()"><i class="ri-close-line"></i></button>
      </header>

      <div class="min-h-0 space-y-5 overflow-y-auto py-5">
        @if (data.canManage) {
          <section class="space-y-3 rounded-xl border border-divider-subtle p-4">
            <div>
              <h3 class="text-sm font-semibold text-text-primary">
                {{ 'XP.XProject.AddProjectConnector' | translate }}
              </h3>
              <p class="mt-1 text-xs text-text-secondary">
                {{ 'XP.XProject.AddProjectConnectorDescription' | translate }}
              </p>
            </div>
            <div
              [class]="
                canSelectAuthorizationMode()
                  ? 'grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_auto]'
                  : 'grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]'
              "
            >
              <z-select
                [zValue]="selectedProvider()"
                [zDisabled]="busy() || !availableDefinitions().length"
                [zPlaceholder]="'XP.XProject.SelectConnector' | translate"
                (zSelectionChange)="selectProvider($event)"
              >
                @for (definition of availableDefinitions(); track definition.provider) {
                  <z-select-item [zValue]="definition.provider">{{ definition.label | i18n }}</z-select-item>
                }
              </z-select>
              @if (canSelectAuthorizationMode()) {
                <z-select [zValue]="selectedMode()" [zDisabled]="busy()" (zSelectionChange)="selectMode($event)">
                  @for (mode of selectedDefinitionModes(); track mode) {
                    <z-select-item [zValue]="mode">{{ modeLabel(mode) | translate }}</z-select-item>
                  }
                </z-select>
              }
              <button
                z-button
                zType="default"
                type="button"
                [disabled]="busy() || !selectedProvider()"
                (click)="createBinding()"
              >
                {{ 'XP.XProject.AddConnector' | translate }}
              </button>
            </div>
            @if (canSelectAuthorizationMode()) {
              <p class="text-xs text-text-tertiary">{{ modeDescription(selectedMode()) | translate }}</p>
            }
          </section>
        }

        <section class="space-y-3">
          @for (binding of bindings(); track binding.id) {
            @let definition = definitionFor(binding.provider);
            @let authMethods = definition ? authMethodsFor(definition) : [];
            @let authMethod = definition ? selectedAuthMethod(binding, definition) : null;
            <article class="space-y-3 rounded-xl border border-divider-subtle p-4">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <h3 class="truncate text-sm font-semibold text-text-primary">
                      {{ definition ? (definition.label | i18n) : binding.provider }}
                    </h3>
                    <z-badge zType="outline">{{ modeLabel(binding.authorizationMode) | translate }}</z-badge>
                    <z-badge [zType]="binding.status === 'active' ? 'default' : 'secondary'">
                      {{ connectorStatusLabel(binding.status) | translate }}
                    </z-badge>
                  </div>
                  <p class="mt-1 text-xs text-text-secondary">
                    {{ modeDescription(binding.authorizationMode) | translate }}
                  </p>
                </div>
                @if (data.canManage) {
                  <button
                    z-button
                    zType="ghost"
                    zSize="sm"
                    type="button"
                    [disabled]="busy()"
                    (click)="deleteBinding(binding)"
                  >
                    <i class="ri-delete-bin-line text-text-destructive"></i>
                  </button>
                }
              </div>

              @if (definition && canConnect(binding)) {
                <form class="grid gap-3" [formGroup]="formFor(binding, definition)">
                  @if (authMethods.length > 1) {
                    <z-form-field>
                      <z-form-label>{{ 'XP.Xpert.ConnectorAuthenticationMethod' | translate }}</z-form-label>
                      <z-select
                        formControlName="authMethodId"
                        (zSelectionChange)="selectAuthMethod(binding, definition, $event)"
                      >
                        @for (method of authMethods; track method.id) {
                          <z-select-item [zValue]="method.id">{{ method.label | i18n }}</z-select-item>
                        }
                      </z-select>
                    </z-form-field>
                  }
                  @for (field of credentialFieldsFor(authMethod); track field.name) {
                    <z-form-field>
                      <z-form-label>{{ field.label | i18n }}</z-form-label>
                      <input
                        z-input
                        [type]="field.type === 'password' || field.secret ? 'password' : 'text'"
                        [formControlName]="field.name"
                        [placeholder]="field.placeholder ? (field.placeholder | i18n) : ''"
                        [attr.autocomplete]="field.type === 'password' || field.secret ? 'new-password' : 'off'"
                      />
                    </z-form-field>
                  }
                </form>
                <div class="flex flex-wrap items-center gap-2">
                  @if (binding.authorizationMode === 'personal') {
                    <button
                      z-button
                      zType="outline"
                      zSize="sm"
                      type="button"
                      [disabled]="busy()"
                      (click)="consent(binding)"
                    >
                      {{ 'XP.XProject.UseExistingPersonalAccount' | translate }}
                    </button>
                  }
                  <button
                    z-button
                    zType="default"
                    zSize="sm"
                    type="button"
                    [disabled]="busy() || (binding.authorizationMode === 'shared' && !data.canManage)"
                    (click)="connect(binding, definition)"
                  >
                    {{
                      (binding.authorizationMode === 'personal'
                        ? 'XP.XProject.ConnectMyAccount'
                        : binding.status === 'active'
                          ? 'XP.XProject.RotateTeamCredential'
                          : 'XP.XProject.ConnectTeamAccount'
                      ) | translate
                    }}
                  </button>
                  @if (pendingAuthorizationUrls()[binding.id]; as authorizationUrl) {
                    <button
                      z-button
                      zType="ghost"
                      zSize="sm"
                      type="button"
                      (click)="openAuthorizationUrl(authorizationUrl)"
                    >
                      {{ 'XP.XProject.ContinueAuthorization' | translate }}
                    </button>
                  }
                </div>
              } @else if (binding.authorizationMode === 'shared' && !data.canManage) {
                <p class="text-xs text-text-tertiary">{{ 'XP.XProject.TeamConnectorManagedByManager' | translate }}</p>
              }
            </article>
          } @empty {
            <div
              class="rounded-xl border border-dashed border-divider-subtle p-8 text-center text-sm text-text-tertiary"
            >
              {{ 'XP.XProject.NoProjectConnectors' | translate }}
            </div>
          }
        </section>
      </div>

      <footer class="flex justify-end border-t border-divider-subtle pt-4">
        <button z-button zType="outline" type="button" (click)="close()">{{ 'XP.XProject.Done' | translate }}</button>
      </footer>
    </section>
  `,
  host: { class: 'block w-full min-w-0' }
})
export class XpertProjectConnectorsDialogComponent {
  readonly #dialogRef = inject<ZardDialogRef<XpertProjectConnectorsDialogComponent>>(ZardDialogRef)
  readonly #connectorService = inject(XpertConnectorService)
  readonly #toastr = inject(ToastrService)
  readonly #destroyRef = inject(DestroyRef)
  readonly data = inject<ProjectConnectorsDialogData>(Z_MODAL_DATA)
  readonly definitions = signal<ConnectorStrategyDefinition[]>([])
  readonly bindings = signal<ConnectorBinding[]>([])
  readonly selectedProvider = signal('')
  readonly selectedMode = signal<ConnectorAuthorizationMode>('shared')
  readonly busy = signal(false)
  readonly pendingAuthorizationUrls = signal<Record<string, string>>({})
  readonly availableDefinitions = computed(() => {
    const providers = new Set(this.bindings().map((binding) => binding.provider))
    return this.definitions().filter((definition) => !providers.has(definition.provider))
  })
  readonly selectedDefinitionModes = computed(() => {
    const definition = this.definitionFor(this.selectedProvider())
    return definition ? getConnectorAuthorizationModes(definition) : (['shared'] as ConnectorAuthorizationMode[])
  })
  readonly canSelectAuthorizationMode = computed(() => this.selectedDefinitionModes().length > 1)
  readonly #forms = new Map<string, FormRecord<FormControl<string>>>()
  readonly #pollTimers = new Map<string, ReturnType<typeof setTimeout>>()

  constructor() {
    this.#destroyRef.onDestroy(() => {
      for (const timer of this.#pollTimers.values()) clearTimeout(timer)
    })
    void this.load()
  }

  async load() {
    this.busy.set(true)
    try {
      const [definitions, bindings] = await Promise.all([
        firstValueFrom(this.#connectorService.scopedDefinitions('project', this.data.projectId)),
        firstValueFrom(this.#connectorService.listBindings('project', this.data.projectId))
      ])
      this.definitions.set(definitions)
      this.bindings.set(bindings)
      this.#forms.clear()
      const selected = this.selectedProvider() || this.availableDefinitions()[0]?.provider || ''
      this.selectedProvider.set(selected)
      this.alignSelectedMode()
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.busy.set(false)
    }
  }

  selectProvider(value: string | number | Array<string | number>) {
    this.selectedProvider.set(normalizeSelection(value))
    this.alignSelectedMode()
  }

  selectMode(value: string | number | Array<string | number>) {
    this.selectedMode.set(normalizeSelection(value) === 'personal' ? 'personal' : 'shared')
  }

  async createBinding() {
    const provider = this.selectedProvider()
    if (!provider || !this.data.canManage) return
    await this.runMutation(async () => {
      await firstValueFrom(
        this.#connectorService.createBinding({
          scope: { type: 'project', projectId: this.data.projectId },
          provider,
          authorizationMode: this.selectedMode()
        })
      )
      this.selectedProvider.set('')
      await this.load()
    })
  }

  async deleteBinding(binding: ConnectorBinding) {
    if (!this.data.canManage) return
    await this.runMutation(async () => {
      await firstValueFrom(this.#connectorService.deleteBinding(binding.id))
      this.bindings.update((items) => items.filter((item) => item.id !== binding.id))
    })
  }

  async consent(binding: ConnectorBinding) {
    await this.runMutation(async () => {
      await firstValueFrom(this.#connectorService.consentToBinding(binding.id))
      await this.load()
    })
  }

  async connect(binding: ConnectorBinding, definition: ConnectorStrategyDefinition) {
    if (!this.canConnect(binding)) return
    const form = this.formFor(binding, definition)
    form.markAllAsTouched()
    if (form.invalid) return
    const authMethod = this.selectedAuthMethod(binding, definition)
    if (!authMethod) return

    const popup = authMethod.type === 'oauth2' ? window.open('', '_blank') : null
    await this.runMutation(async () => {
      const response = await firstValueFrom(
        this.#connectorService.connectBinding(binding.id, {
          authMethodId: authMethod.id,
          ...this.connectorValues(binding, definition, authMethod)
        })
      )
      if (response.authorizationUrl) {
        this.pendingAuthorizationUrls.update((urls) => ({ ...urls, [binding.id]: response.authorizationUrl as string }))
        if (popup) {
          popup.opener = null
          popup.location.href = response.authorizationUrl
          popup.focus()
        }
        this.scheduleAuthorizationPoll(binding.id, response.pollIntervalSeconds ?? 5)
      } else {
        popup?.close()
        await this.load()
      }
    }, popup)
  }

  authMethodsFor(definition: ConnectorStrategyDefinition) {
    return getConnectorAuthMethods(definition)
  }

  formFor(binding: ConnectorBinding, definition: ConnectorStrategyDefinition) {
    let form = this.#forms.get(binding.id)
    if (!form) {
      const method =
        this.authMethodsFor(definition).find((item) => item.id === binding.authMethodId) ??
        this.authMethodsFor(definition)[0]
      form = new FormRecord<FormControl<string>>({
        authMethodId: new FormControl(method?.id ?? '', { nonNullable: true, validators: [Validators.required] })
      })
      if (method) this.configureCredentialControls(form, method)
      this.#forms.set(binding.id, form)
    }
    return form
  }

  selectedAuthMethod(binding: ConnectorBinding, definition: ConnectorStrategyDefinition) {
    const id = this.formFor(binding, definition).controls.authMethodId?.value
    return this.authMethodsFor(definition).find((method) => method.id === id) ?? null
  }

  selectAuthMethod(
    binding: ConnectorBinding,
    definition: ConnectorStrategyDefinition,
    value: string | number | Array<string | number>
  ) {
    const method = this.authMethodsFor(definition).find((item) => item.id === normalizeSelection(value))
    if (!method) return
    const form = this.formFor(binding, definition)
    form.controls.authMethodId?.setValue(method.id)
    this.configureCredentialControls(form, method)
  }

  credentialFieldsFor(method?: ConnectorAuthMethodDefinition | null) {
    return this.credentialFormFor(method)?.fields ?? []
  }

  definitionFor(provider: string) {
    return this.definitions().find((definition) => definition.provider === provider) ?? null
  }

  canConnect(binding: ConnectorBinding) {
    return binding.authorizationMode === 'personal' || this.data.canManage
  }

  modeLabel(mode: ConnectorAuthorizationMode) {
    return mode === 'personal' ? 'XP.XProject.PersonalAuthorization' : 'XP.XProject.TeamAuthorization'
  }

  modeDescription(mode: ConnectorAuthorizationMode) {
    return mode === 'personal'
      ? 'XP.XProject.PersonalAuthorizationDescription'
      : 'XP.XProject.TeamAuthorizationDescription'
  }

  connectorStatusLabel(status: ConnectorBinding['status']) {
    switch (status) {
      case 'active':
        return 'XP.Xpert.ConnectorStatusConnected'
      case 'pending':
        return 'XP.Xpert.ConnectorStatusPending'
      case 'expired':
        return 'XP.Xpert.ConnectorStatusExpired'
      case 'error':
        return 'XP.Xpert.ConnectorStatusError'
      case 'disconnected':
        return 'XP.Xpert.ConnectorStatusDisconnected'
    }
  }

  openAuthorizationUrl(url: string) {
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  close() {
    this.#dialogRef.close()
  }

  private credentialFormFor(
    method?: ConnectorAuthMethodDefinition | null
  ): ConnectorCredentialFormDefinition | undefined {
    if (!method) return undefined
    return method.type === 'oauth2' ? method.appCredentials : method.credentials
  }

  private configureCredentialControls(form: FormRecord<FormControl<string>>, method: ConnectorAuthMethodDefinition) {
    for (const name of Object.keys(form.controls)) {
      if (name !== 'authMethodId') form.removeControl(name)
    }
    const definition = this.credentialFormFor(method)
    for (const field of definition?.fields ?? []) {
      const defaultValue = definition.defaultValues?.[field.name]
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
    binding: ConnectorBinding,
    definition: ConnectorStrategyDefinition,
    method: ConnectorAuthMethodDefinition
  ) {
    const values: Record<string, unknown> = {}
    const form = this.formFor(binding, definition)
    for (const field of this.credentialFieldsFor(method)) {
      const value = form.controls[field.name]?.value
      if (value !== undefined && value !== '') values[field.name] = value
    }
    return Object.keys(values).length ? { values } : {}
  }

  private alignSelectedMode() {
    const modes = this.selectedDefinitionModes()
    if (!modes.includes(this.selectedMode())) this.selectedMode.set(modes[0] ?? 'shared')
  }

  private scheduleAuthorizationPoll(bindingId: string, intervalSeconds: number) {
    const current = this.#pollTimers.get(bindingId)
    if (current) clearTimeout(current)
    this.#pollTimers.set(
      bindingId,
      setTimeout(
        () => void this.pollAuthorization(bindingId, intervalSeconds),
        Math.max(2_000, intervalSeconds * 1_000)
      )
    )
  }

  private async pollAuthorization(bindingId: string, intervalSeconds: number) {
    try {
      const response = await firstValueFrom(this.#connectorService.bindingAuthorizationStatus(bindingId))
      if (response.connector.status === 'pending') {
        if (response.authorizationUrl) {
          this.pendingAuthorizationUrls.update((urls) => ({
            ...urls,
            [bindingId]: response.authorizationUrl as string
          }))
        }
        this.scheduleAuthorizationPoll(bindingId, response.pollIntervalSeconds ?? intervalSeconds)
      } else {
        this.pendingAuthorizationUrls.update((urls) => {
          const next = { ...urls }
          delete next[bindingId]
          return next
        })
        await this.load()
      }
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    }
  }

  private async runMutation(operation: () => Promise<void>, popup?: Window | null) {
    this.busy.set(true)
    try {
      await operation()
    } catch (error) {
      popup?.close()
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.busy.set(false)
    }
  }
}

function normalizeSelection(value: string | number | Array<string | number>) {
  const selected = Array.isArray(value) ? value[0] : value
  return selected == null ? '' : String(selected)
}
