import { DialogRef, DIALOG_DATA } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject, model, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import {
  getErrorMessage,
  injectToastr,
  injectXpertAPI,
  IXpert,
  IXpertAgent,
  IXpertWorkspace,
  OrderTypeEnum,
  XpertWorkspaceService
} from '@cloud/app/@core'
import {
  injectPluginAPI,
  IPluginComponentDefinition,
  IPluginResourceComponentState,
  IPluginResourceInstallResult,
  PLUGIN_COMPONENT_TYPE,
  PLUGIN_RESOURCE_INSTALLATION_STATUS,
  PluginComponentType
} from '@xpert-ai/cloud/state'
import { NgmSpinComponent } from '@xpert-ai/ocap-angular/common'
import { myRxResource } from '@xpert-ai/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { firstValueFrom, map, of } from 'rxjs'
import { TInstalledPlugin } from '../types'

export type PluginResourcesDialogData = {
  plugin: TInstalledPlugin
  reload?: () => void
  initialComponents?: Array<{
    componentType?: PluginComponentType
    componentKey: string
  }>
  initialWorkspaceId?: string
  initialInstallMode?: InstallMode
  closeOnSuccess?: boolean
}

type InstallMode = 'workspace' | 'xpert'

type PluginComponentGroup = {
  type: PluginComponentType
  labelKey: string
  defaultLabel: string
  items: PluginComponentView[]
}

type PluginComponentView = IPluginComponentDefinition & {
  installationState?: IPluginResourceComponentState | null
}

type XpertOption = {
  id: string
  name: string
  title?: string
  primaryAgentKey?: string | null
  agentOptions: Array<{ key: string; label: string }>
}

type PluginComponentBadge = {
  labelKey: string
  defaultLabel: string
}

type PluginResourceStateRequest =
  | { pluginName: string; target: 'workspace'; workspaceId: string }
  | { pluginName: string; target: 'xpert'; workspaceId: string; xpertId: string; agentKey?: string }
  | null

const WORKSPACE_COMPONENT_TYPES: PluginComponentType[] = [
  PLUGIN_COMPONENT_TYPE.SKILL,
  PLUGIN_COMPONENT_TYPE.MCP_SERVER,
  PLUGIN_COMPONENT_TYPE.APP
]
const XPERT_COMPONENT_TYPES: PluginComponentType[] = [PLUGIN_COMPONENT_TYPE.HOOK]

@Component({
  standalone: true,
  selector: 'xp-plugin-resources',
  imports: [CommonModule, FormsModule, TranslateModule, NgmSpinComponent],
  templateUrl: './resources.component.html'
})
export class PluginResourcesComponent {
  private readonly dialogRef = inject(DialogRef)
  private readonly data = inject<PluginResourcesDialogData>(DIALOG_DATA)
  private readonly pluginAPI = injectPluginAPI()
  private readonly workspaceService = inject(XpertWorkspaceService)
  private readonly xpertAPI = injectXpertAPI()
  private readonly toastr = injectToastr()

  readonly plugin = signal(this.data.plugin)
  readonly installMode = model<InstallMode>(this.data.initialInstallMode ?? 'workspace')
  readonly selectedWorkspaceId = model<string>(this.data.initialWorkspaceId ?? '')
  readonly selectedXpertId = model<string>('')
  readonly selectedAgentKey = model<string>('')
  readonly selectedKeys = signal<string[]>([])
  readonly submitting = signal(false)
  readonly actionError = signal<string | null>(null)
  readonly actionResult = signal<IPluginResourceInstallResult | null>(null)

  readonly #workspaces = myRxResource({
    request: () => 'workspace-list',
    loader: () =>
      this.workspaceService
        .getAllMy(
          {
            order: { updatedAt: OrderTypeEnum.DESC }
          },
          { purpose: 'authoring' }
        )
        .pipe(map((response) => response.items ?? []))
  })

  readonly workspaces = computed(() => this.#workspaces.value() ?? [])
  readonly workspaceLoading = computed(() => this.#workspaces.status() === 'loading')
  readonly workspaceError = computed(() => {
    const error = this.#workspaces.error()
    return error ? getErrorMessage(error) : null
  })

  readonly #components = myRxResource({
    request: () => {
      const pluginName = this.plugin()?.name
      return pluginName || null
    },
    loader: ({ request }) =>
      request ? this.pluginAPI.getPluginComponents(request).pipe(map((result) => result.items ?? [])) : of([])
  })

  readonly #componentStates = myRxResource<PluginResourceStateRequest, IPluginResourceComponentState[]>({
    request: () => {
      const pluginName = this.plugin()?.name
      const workspaceId = this.selectedWorkspaceId()
      if (!pluginName || !workspaceId) {
        return null
      }
      if (this.installMode() === 'xpert') {
        const xpertId = this.selectedXpertId()
        if (!xpertId) {
          return null
        }
        return {
          pluginName,
          target: 'xpert' as const,
          workspaceId,
          xpertId,
          agentKey: this.selectedAgentKey() || undefined
        }
      }
      return {
        pluginName,
        target: 'workspace' as const,
        workspaceId
      }
    },
    options: {
      equal: samePluginResourceStateRequest
    },
    loader: ({ request }) =>
      request
        ? this.pluginAPI.getPluginResourceStates(request.pluginName, request).pipe(map((result) => result.items ?? []))
        : of([])
  })

  readonly componentDefinitions = computed(() => this.#components.value() ?? [])
  readonly componentStates = computed(() => this.#componentStates.value() ?? [])
  readonly componentStateMap = computed(() => {
    const map = new Map<string, IPluginResourceComponentState>()
    for (const state of this.componentStates()) {
      map.set(this.componentStateKey(state), state)
    }
    return map
  })
  readonly components = computed<PluginComponentView[]>(() =>
    this.componentDefinitions().map((component) => ({
      ...component,
      installationState: this.componentStateMap().get(this.componentStateKey(component)) ?? null
    }))
  )
  readonly componentsLoading = computed(() => this.#components.status() === 'loading')
  readonly componentsError = computed(() => {
    const error = this.#components.error()
    return error ? getErrorMessage(error) : null
  })

  readonly componentStatesLoading = computed(() => this.#componentStates.status() === 'loading')
  readonly componentStatesError = computed(() => {
    const error = this.#componentStates.error()
    return error ? getErrorMessage(error) : null
  })
  readonly resourceLoading = computed(() => this.componentsLoading())
  readonly resourceError = computed(() => this.componentsError())

  readonly targetComponents = computed(() =>
    this.components().filter((component) => this.isInstallableInMode(component, this.installMode()))
  )
  readonly installableComponents = computed(() =>
    this.targetComponents().filter((component) => !this.isInstalledCurrent(component))
  )

  readonly #xperts = myRxResource({
    request: () => {
      const workspaceId = this.selectedWorkspaceId()
      return this.installMode() === 'xpert' && workspaceId ? workspaceId : null
    },
    loader: ({ request }) =>
      request
        ? this.xpertAPI
            .getAllByWorkspace(request, {
              where: {
                latest: true
              },
              order: {
                updatedAt: OrderTypeEnum.DESC
              },
              relations: ['agent']
            })
            .pipe(map((result) => result.items ?? []))
        : of([])
  })

  readonly xperts = computed<XpertOption[]>(() =>
    (this.#xperts.value() ?? []).map((xpert) => {
      const agentOptions = this.toAgentOptions(xpert)
      return {
        id: xpert.id,
        name: xpert.name,
        title: xpert.title,
        primaryAgentKey: xpert.agent?.key ?? agentOptions[0]?.key ?? null,
        agentOptions
      }
    })
  )
  readonly xpertLoading = computed(() => this.#xperts.status() === 'loading')
  readonly xpertError = computed(() => {
    const error = this.#xperts.error()
    return error ? getErrorMessage(error) : null
  })

  readonly groupedComponents = computed<PluginComponentGroup[]>(() => {
    const components = this.targetComponents()
    return [
      {
        type: PLUGIN_COMPONENT_TYPE.SKILL,
        labelKey: 'PAC.Plugin.ResourceGroupSkills',
        defaultLabel: 'Skills',
        items: components.filter((item) => item.componentType === PLUGIN_COMPONENT_TYPE.SKILL)
      },
      {
        type: PLUGIN_COMPONENT_TYPE.MCP_SERVER,
        labelKey: 'PAC.Plugin.ResourceGroupMcp',
        defaultLabel: 'MCP',
        items: components.filter((item) => item.componentType === PLUGIN_COMPONENT_TYPE.MCP_SERVER)
      },
      {
        type: PLUGIN_COMPONENT_TYPE.APP,
        labelKey: 'PAC.Plugin.ResourceGroupApps',
        defaultLabel: 'Apps',
        items: components.filter((item) => item.componentType === PLUGIN_COMPONENT_TYPE.APP)
      },
      {
        type: PLUGIN_COMPONENT_TYPE.HOOK,
        labelKey: 'PAC.Plugin.ResourceGroupHooks',
        defaultLabel: 'Hooks',
        items: components.filter((item) => item.componentType === PLUGIN_COMPONENT_TYPE.HOOK)
      }
    ].filter((group) => group.items.length > 0)
  })

  readonly selectedComponents = computed(() => {
    const selected = new Set(this.selectedKeys())
    return this.installableComponents().filter((component) => selected.has(this.componentSelectionKey(component)))
  })

  readonly canSubmit = computed(() => {
    if (this.submitting() || this.componentsLoading()) {
      return false
    }

    if (!this.selectedComponents().length) {
      return false
    }

    if (!this.selectedWorkspaceId()) {
      return false
    }

    if (this.installMode() === 'workspace') {
      return true
    }

    return !!this.selectedXpertId()
  })

  constructor() {
    effect(() => {
      const components = this.installableComponents()
      const initialComponents = this.data.initialComponents ?? []
      if (!components.length || !initialComponents.length || this.selectedKeys().length) {
        return
      }
      const nextKeys = components
        .filter((component) =>
          initialComponents.some(
            (selector) =>
              selector.componentKey === component.componentKey &&
              (!selector.componentType || selector.componentType === component.componentType)
          )
        )
        .map((component) => this.componentSelectionKey(component))
      if (nextKeys.length) {
        this.setSelectedKeys(nextKeys)
      }
    })

    effect(() => {
      const workspaces = this.workspaces()
      if (!workspaces.length || this.selectedWorkspaceId()) {
        return
      }
      this.selectedWorkspaceId.set(workspaces[0]?.id ?? '')
    })

    effect(() => {
      const xperts = this.xperts()
      const selectedXpertId = this.selectedXpertId()
      if (!xperts.length) {
        if (selectedXpertId) {
          this.selectedXpertId.set('')
        }
        if (this.selectedAgentKey()) {
          this.selectedAgentKey.set('')
        }
        return
      }

      const nextXpert = xperts.find((item) => item.id === selectedXpertId) ?? xperts[0]
      if (!nextXpert) {
        return
      }

      if (nextXpert.id !== selectedXpertId) {
        this.selectedXpertId.set(nextXpert.id)
      }

      const nextAgentKey =
        nextXpert.agentOptions.find((item) => item.key === this.selectedAgentKey())?.key ??
        nextXpert.primaryAgentKey ??
        ''
      if (nextAgentKey !== this.selectedAgentKey()) {
        this.selectedAgentKey.set(nextAgentKey)
      }
    })

    effect(() => {
      const available = new Set(this.installableComponents().map((component) => this.componentSelectionKey(component)))
      this.selectedKeys.update((keys) => {
        const next = keys.filter((key) => available.has(key))
        return next.length === keys.length ? keys : next
      })
    })
  }

  close() {
    if (!this.submitting()) {
      this.dialogRef.close(this.actionResult())
    }
  }

  workspaceLabel(workspace: IXpertWorkspace) {
    return workspace.name?.trim() || workspace.id
  }

  xpertLabel(xpert: XpertOption) {
    return xpert.title?.trim() || xpert.name || xpert.id
  }

  isSelected(component: IPluginComponentDefinition) {
    return this.selectedKeys().includes(this.componentSelectionKey(component))
  }

  toggleComponent(component: PluginComponentView, checked: boolean) {
    if (this.isInstalledCurrent(component)) {
      return
    }
    const key = this.componentSelectionKey(component)
    this.selectedKeys.update((keys) => {
      if (checked) {
        return keys.includes(key) ? keys : [...keys, key]
      }
      const next = keys.filter((item) => item !== key)
      return next.length === keys.length ? keys : next
    })
  }

  onComponentCheckedChange(component: PluginComponentView, event: Event) {
    const checked = event.target instanceof HTMLInputElement ? event.target.checked : false
    this.toggleComponent(component, checked)
  }

  selectAllInstallable() {
    this.setSelectedKeys(this.installableComponents().map((component) => this.componentSelectionKey(component)))
  }

  clearSelection() {
    this.setSelectedKeys([])
  }

  componentTypeBadge(component: IPluginComponentDefinition): PluginComponentBadge {
    if (component.componentType === PLUGIN_COMPONENT_TYPE.SKILL) {
      return {
        labelKey: 'PAC.Plugin.ResourceTypeSkill',
        defaultLabel: 'Skill'
      }
    }
    if (component.componentType === PLUGIN_COMPONENT_TYPE.MCP_SERVER) {
      return {
        labelKey: 'PAC.Plugin.ResourceTypeMcp',
        defaultLabel: 'MCP'
      }
    }
    if (component.componentType === PLUGIN_COMPONENT_TYPE.APP) {
      return {
        labelKey: 'PAC.Plugin.ResourceTypeApp',
        defaultLabel: 'App'
      }
    }
    return {
      labelKey: 'PAC.Plugin.ResourceTypeHook',
      defaultLabel: 'Hook'
    }
  }

  isInstalled(component: Pick<PluginComponentView, 'installationState'>) {
    return component.installationState?.installed ?? false
  }

  isInstalledCurrent(component: Pick<PluginComponentView, 'installationState'>) {
    return this.isInstalled(component) && !component.installationState?.staleDefinition
  }

  isUpdateAvailable(component: Pick<PluginComponentView, 'installationState'>) {
    return this.isInstalled(component) && !!component.installationState?.staleDefinition
  }

  isPendingAuth(component: Pick<PluginComponentView, 'installationState'>) {
    return component.installationState?.status === PLUGIN_RESOURCE_INSTALLATION_STATUS.PENDING_AUTH
  }

  async submit() {
    const pluginName = this.plugin()?.name
    const workspaceId = this.selectedWorkspaceId()
    if (!pluginName || !workspaceId || !this.canSubmit()) {
      return
    }

    this.submitting.set(true)
    this.actionError.set(null)
    this.actionResult.set(null)

    try {
      const components = this.selectedComponents().map((component) => ({
        componentType: component.componentType,
        componentKey: component.componentKey
      }))

      const result =
        this.installMode() === 'workspace'
          ? await firstValueFrom(this.pluginAPI.installResourcesToWorkspace(pluginName, { workspaceId, components }))
          : await firstValueFrom(
              this.pluginAPI.installResourcesToXpert(pluginName, {
                xpertId: this.selectedXpertId(),
                agentKey: this.selectedAgentKey() || undefined,
                components
              })
            )

      this.actionResult.set(result)
      this.#componentStates.reload()
      this.data.reload?.()
      const successKey =
        this.installMode() === 'workspace'
          ? 'PAC.Plugin.ResourcesInstalledToWorkspace'
          : 'PAC.Plugin.ResourcesInstalledToXpert'
      this.toastr.success(successKey, {
        Default:
          this.installMode() === 'workspace'
            ? 'Plugin resources initialized in the workspace.'
            : 'Plugin resources initialized and attached to the Xpert.'
      })
      if (this.data.closeOnSuccess) {
        this.dialogRef.close(result)
      }
    } catch (error) {
      this.actionError.set(getErrorMessage(error))
    } finally {
      this.submitting.set(false)
    }
  }

  resultSummary() {
    const result = this.actionResult()
    if (!result) {
      return null
    }

    return {
      installations: result.installations.length,
      pendingAuth: result.pendingAuth.length
    }
  }

  agentOptionsForSelectedXpert() {
    return this.xperts().find((item) => item.id === this.selectedXpertId())?.agentOptions ?? []
  }

  private componentSelectionKey(component: Pick<IPluginComponentDefinition, 'componentType' | 'componentKey'>) {
    return `${component.componentType}:${component.componentKey}`
  }

  private componentStateKey(component: Pick<IPluginResourceComponentState, 'componentType' | 'componentKey'>) {
    return `${component.componentType}:${component.componentKey}`
  }

  private isInstallableInMode(component: Pick<IPluginComponentDefinition, 'componentType'>, mode: InstallMode) {
    return (mode === 'workspace' ? WORKSPACE_COMPONENT_TYPES : XPERT_COMPONENT_TYPES).includes(component.componentType)
  }

  private toAgentOptions(xpert: IXpert): Array<{ key: string; label: string }> {
    const agentEntries = new Map<string, string>()
    const primaryAgent = xpert.agent
    if (primaryAgent?.key) {
      agentEntries.set(primaryAgent.key, this.agentLabel(primaryAgent))
    }

    const draftAgents =
      xpert.draft?.nodes
        ?.filter(
          (node): node is (typeof xpert.draft.nodes)[number] & { type: 'agent'; entity: IXpertAgent } =>
            node.type === 'agent'
        )
        .map((node) => node.entity) ?? []

    for (const agent of draftAgents) {
      if (agent?.key && !agentEntries.has(agent.key)) {
        agentEntries.set(agent.key, this.agentLabel(agent))
      }
    }

    return Array.from(agentEntries.entries()).map(([key, label]) => ({ key, label }))
  }

  private agentLabel(agent: IXpertAgent) {
    return agent.title?.trim() || agent.name?.trim() || agent.key
  }

  private setSelectedKeys(keys: string[]) {
    this.selectedKeys.update((current) => (sameStringArray(current, keys) ? current : keys))
  }
}

function samePluginResourceStateRequest(a: PluginResourceStateRequest, b: PluginResourceStateRequest) {
  if (a === b) {
    return true
  }
  if (!a || !b) {
    return false
  }
  if (a.pluginName !== b.pluginName || a.target !== b.target || a.workspaceId !== b.workspaceId) {
    return false
  }
  if (a.target === 'workspace' || b.target === 'workspace') {
    return true
  }
  return a.xpertId === b.xpertId && (a.agentKey ?? '') === (b.agentKey ?? '')
}

function sameStringArray(a: string[], b: string[]) {
  return a.length === b.length && a.every((item, index) => item === b[index])
}
