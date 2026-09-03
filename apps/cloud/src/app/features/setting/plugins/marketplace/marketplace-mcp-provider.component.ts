import { CommonModule } from '@angular/common'
import { Clipboard } from '@angular/cdk/clipboard'
import { Component, computed, effect, inject, input, signal } from '@angular/core'
import { getErrorMessage, injectToastr, injectUser } from '@cloud/app/@core'
import {
  injectPluginAPI,
  IPluginComponentDefinition,
  IPluginMcpServerConnectionInfo,
  IPluginResourceComponentState
} from '@cloud/app/@core/state'
import { RolesEnum } from '@xpert-ai/contracts'
import { myRxResource, XpSpinComponent } from '@xpert-ai/headless-ui'
import { TranslateModule } from '@ngx-translate/core'
import { firstValueFrom, map, of } from 'rxjs'

type NativeMcpConnectionState = {
  connectionInfo: IPluginMcpServerConnectionInfo
  apiKeySecret?: string
}

type NativeMcpStateRequest = {
  pluginName: string
  componentKey: string
}

@Component({
  standalone: true,
  selector: 'xp-plugin-marketplace-mcp-provider',
  imports: [CommonModule, TranslateModule, XpSpinComponent],
  templateUrl: './marketplace-mcp-provider.component.html'
})
export class PluginMarketplaceMcpProviderComponent {
  private readonly pluginAPI = injectPluginAPI()
  private readonly toastr = injectToastr()
  private readonly currentUser = injectUser()
  private readonly clipboard = inject(Clipboard)

  readonly pluginName = input('')
  readonly component = input<IPluginComponentDefinition | null>(null)
  readonly showActions = input(true)
  readonly surface = input<'card' | 'flat'>('card')
  readonly reload = input<() => void>(() => undefined)

  readonly actionPending = signal(false)
  readonly actionError = signal<string | null>(null)
  readonly connectionOverride = signal<NativeMcpConnectionState | null>(null)
  readonly activeOverride = signal<boolean | null>(null)
  readonly credentialVisible = signal(false)
  readonly #credentialPrefetchRequested = signal(false)

  readonly #componentState = myRxResource<NativeMcpStateRequest | null, IPluginResourceComponentState | null>({
    request: () => {
      const pluginName = this.pluginName()
      const componentKey = this.component()?.componentKey
      return pluginName && componentKey ? { pluginName, componentKey } : null
    },
    options: {
      equal: (left, right) =>
        left === right ||
        (!!left && !!right && left.pluginName === right.pluginName && left.componentKey === right.componentKey)
    },
    loader: ({ request }) =>
      request
        ? this.pluginAPI
            .getPluginResourceStates(request.pluginName, {
              target: 'organization'
            })
            .pipe(
              map(
                (result) =>
                  result.items?.find(
                    (state) =>
                      state.componentType === this.component()?.componentType &&
                      state.componentKey === request.componentKey
                  ) ?? null
              )
            )
        : of(null)
  })

  readonly componentState = computed(() => this.#componentState.value() ?? null)
  readonly stateLoading = computed(() => this.#componentState.status() === 'loading')
  readonly stateError = computed(() => {
    const error = this.#componentState.error()
    return error ? getErrorMessage(error) : null
  })
  readonly syncError = computed(() => this.componentState()?.mcpServer?.syncError ?? null)
  readonly canManage = computed(() => this.showActions() && this.currentUser()?.role?.name === RolesEnum.SUPER_ADMIN)
  readonly isActive = computed(() => this.activeOverride() ?? this.componentState()?.mcpServer?.status === 'active')
  readonly canOpenAdvancedSettings = computed(
    () => this.canManage() && this.componentState()?.mcpServer?.publicationScope === 'organization'
  )
  readonly connection = computed<NativeMcpConnectionState | null>(() => {
    const override = this.connectionOverride()
    if (override) return override
    const server = this.componentState()?.mcpServer
    if (!this.isActive() || !server?.endpoint) return null
    return {
      connectionInfo: {
        protocolVersion: server.protocolVersion ?? '2026-07-28',
        transport: 'streamable-http',
        endpoint: server.endpoint,
        authorization: 'Bearer'
      }
    }
  })
  readonly toolCount = computed(() => readConfigNumber(this.component()?.config, 'toolCount') ?? 0)
  readonly clientConfiguration = computed(() => this.buildClientConfiguration('${XPERT_MCP_API_KEY}'))

  constructor() {
    effect(() => {
      const pluginName = this.pluginName()
      const component = this.component()
      const connection = this.connection()
      if (
        pluginName &&
        component &&
        this.canManage() &&
        this.isActive() &&
        connection &&
        !connection.apiKeySecret &&
        !this.#credentialPrefetchRequested()
      ) {
        this.#credentialPrefetchRequested.set(true)
        void this.retrieveCredential(false)
      }
    })
  }

  private buildClientConfiguration(apiKey: string) {
    const component = this.component()
    const endpoint = this.connection()?.connectionInfo.endpoint
    if (!component || !endpoint) return ''
    const serverName = readConfigString(component.config, 'provider') ?? component.componentKey
    return JSON.stringify(
      {
        mcpServers: {
          [serverName]: {
            type: 'streamableHttp',
            url: endpoint,
            headers: { Authorization: `Bearer ${apiKey}` }
          }
        }
      },
      null,
      2
    )
  }

  async enable() {
    const pluginName = this.pluginName()
    const component = this.component()
    if (!pluginName || !component || !this.canManage() || this.actionPending()) return
    this.actionPending.set(true)
    this.actionError.set(null)
    try {
      const result = await firstValueFrom(this.pluginAPI.enablePluginMcpServer(pluginName, component.componentKey))
      this.connectionOverride.set({
        connectionInfo: result.connectionInfo,
        ...(result.createdApiKey?.secret ? { apiKeySecret: result.createdApiKey.secret } : {})
      })
      this.credentialVisible.set(!!result.createdApiKey?.secret)
      this.activeOverride.set(true)
      this.#componentState.reload()
      this.reload()()
      this.toastr.success('XP.Plugin.McpServerEnabledToast', { Default: 'Plugin MCP server enabled.' })
    } catch (error) {
      this.actionError.set(getErrorMessage(error))
    } finally {
      this.actionPending.set(false)
    }
  }

  async disable() {
    const pluginName = this.pluginName()
    const component = this.component()
    if (!pluginName || !component || !this.canManage() || this.actionPending()) return
    this.actionPending.set(true)
    this.actionError.set(null)
    try {
      await firstValueFrom(this.pluginAPI.disablePluginMcpServer(pluginName, component.componentKey))
      this.connectionOverride.set(null)
      this.credentialVisible.set(false)
      this.#credentialPrefetchRequested.set(false)
      this.activeOverride.set(false)
      this.#componentState.reload()
      this.reload()()
      this.toastr.success('XP.Plugin.McpServerDisabledToast', { Default: 'Plugin MCP server disabled.' })
    } catch (error) {
      this.actionError.set(getErrorMessage(error))
    } finally {
      this.actionPending.set(false)
    }
  }

  async loadConnection() {
    const pluginName = this.pluginName()
    const component = this.component()
    if (!pluginName || !component || !this.canManage() || this.actionPending()) return
    this.actionPending.set(true)
    this.actionError.set(null)
    try {
      const connectionInfo = await firstValueFrom(
        this.pluginAPI.getPluginMcpServerConnectionInfo(pluginName, component.componentKey)
      )
      this.connectionOverride.set({ connectionInfo })
    } catch (error) {
      this.actionError.set(getErrorMessage(error))
    } finally {
      this.actionPending.set(false)
    }
  }

  async toggleCredential() {
    const current = this.connection()?.apiKeySecret
    if (current) {
      this.credentialVisible.update((visible) => !visible)
      return
    }
    await this.retrieveCredential(true)
  }

  async copyClientConfiguration() {
    const placeholderConfiguration = this.clientConfiguration()
    if (!placeholderConfiguration || this.actionPending()) return

    if (!this.canManage()) {
      await this.copyText(placeholderConfiguration)
      return
    }

    const existingSecret = this.connection()?.apiKeySecret
    if (existingSecret) {
      await this.copyText(this.buildClientConfiguration(existingSecret))
      return
    }

    const pluginName = this.pluginName()
    const component = this.component()
    if (!pluginName || !component) return

    this.actionPending.set(true)
    this.actionError.set(null)
    try {
      const credential = await firstValueFrom(
        this.pluginAPI.getPluginMcpServerCredential(pluginName, component.componentKey)
      )
      this.connectionOverride.set({
        connectionInfo: credential.connectionInfo,
        apiKeySecret: credential.secret
      })
      await this.copyText(this.buildClientConfiguration(credential.secret))
    } catch (error) {
      this.actionError.set(getErrorMessage(error))
    } finally {
      this.actionPending.set(false)
    }
  }

  copyText(value: string) {
    if (this.clipboard.copy(value)) {
      this.toastr.success('XP.Plugin.CopySucceeded', { Default: 'Copied.' })
    } else {
      this.toastr.error('XP.Messages.CopyFailed', 'XP.TOASTR.TITLE.ERROR', { Default: 'Could not copy.' })
    }
  }

  private async retrieveCredential(reveal: boolean) {
    const pluginName = this.pluginName()
    const component = this.component()
    if (!pluginName || !component || !this.canManage() || this.actionPending()) return
    this.actionPending.set(true)
    this.actionError.set(null)
    try {
      const credential = await firstValueFrom(
        this.pluginAPI.getPluginMcpServerCredential(pluginName, component.componentKey)
      )
      this.connectionOverride.set({
        connectionInfo: credential.connectionInfo,
        apiKeySecret: credential.secret
      })
      this.credentialVisible.set(reveal)
    } catch (error) {
      this.actionError.set(getErrorMessage(error))
    } finally {
      this.actionPending.set(false)
    }
  }
}

function readConfigNumber(value: unknown, key: string) {
  if (!value || typeof value !== 'object') return undefined
  const field = Reflect.get(value, key)
  return typeof field === 'number' ? field : undefined
}

function readConfigString(value: unknown, key: string) {
  if (!value || typeof value !== 'object') return undefined
  const field = Reflect.get(value, key)
  return typeof field === 'string' && field ? field : undefined
}
