import { inject, Injectable, signal } from '@angular/core'
import { Router } from '@angular/router'
import { IPluginDescriptor, injectPluginAPI } from '@xpert-ai/cloud/state'
import {
  PLUGIN_LOAD_STATUS,
  replaceAgentInDraft,
  type TXpertTeamDraft,
  type XpertTemplatePluginDependencies
} from '@xpert-ai/contracts'
import { firstValueFrom } from 'rxjs'
import {
  AiModelTypeEnum,
  AssistantBindingScope,
  AssistantBindingService,
  AssistantCode,
  CopilotServerService,
  EnvironmentService,
  ICopilotModel,
  ICopilotWithProvider,
  IXpert,
  IXpertWorkspace,
  ToastrService,
  uid10,
  XpertAPIService,
  XpertAgentService,
  XpertTemplateService,
  XpertWorkspaceService
} from '../../../@core'
import { CLAWXPERT_TEMPLATE_ID } from './clawxpert-template.constants'

const CLAWXPERT_NAME = 'clawxpert'
const CLAWXPERT_AUTO_PUBLISH_RELEASE_NOTES = 'Initial ClawXpert bootstrap release.'
const CLAWXPERT_DEFAULT_WORKSPACE_NAME = 'Default Workspace'

@Injectable({ providedIn: 'root' })
export class ClawXpertBootstrapService {
  readonly #assistantBindingService = inject(AssistantBindingService)
  readonly #copilotServer = inject(CopilotServerService)
  readonly #environmentService = inject(EnvironmentService)
  readonly #pluginAPI = injectPluginAPI()
  readonly #router = inject(Router)
  readonly #toastr = inject(ToastrService)
  readonly #xpertService = inject(XpertAPIService)
  readonly #xpertAgentService = inject(XpertAgentService)
  readonly #xpertTemplateService = inject(XpertTemplateService)
  readonly #workspaceService = inject(XpertWorkspaceService)
  #pendingCreatedConversationXpertId: string | null = null
  readonly #pendingCreatedClawXpert = signal<IXpert | null>(null)
  readonly pendingCreatedClawXpert = this.#pendingCreatedClawXpert.asReadonly()

  async resolveFirstAvailableLlmModel(): Promise<ICopilotModel | null> {
    const copilots = await firstValueFrom(this.#copilotServer.getCopilotModels(AiModelTypeEnum.LLM))
    return resolveFirstClawXpertLlmModel(copilots)
  }

  async createClawXpert(selectedCopilotModel: ICopilotModel): Promise<IXpert> {
    await this.prepareClawXpertTemplatePlugins()
    const workspace = await this.ensureDefaultWorkspace()
    const installName = createClawXpertInstallName()
    const installed = await firstValueFrom(
      this.#xpertTemplateService.installTemplate(CLAWXPERT_TEMPLATE_ID, {
        workspaceId: workspace.id,
        basic: {
          name: installName,
          title: installName,
          copilotModel: selectedCopilotModel
        }
      })
    )
    const createdXpert = installed.xpert
    if (!createdXpert?.id) {
      throw new Error('ClawXpert template installation did not return an xpert id.')
    }
    await this.refreshDraftSnapshotBeforePublish(createdXpert)
    const bindableXpert = await this.publishCreatedXpertOrFallback(createdXpert)

    return bindableXpert
  }

  async createAndOpenClawXpert(selectedCopilotModel: ICopilotModel): Promise<IXpert> {
    const xpert = await this.createClawXpert(selectedCopilotModel)
    await this.bindAndOpenCreatedClawXpert(xpert)
    return xpert
  }

  async bindAndOpenCreatedClawXpert(xpert: IXpert): Promise<void> {
    if (!xpert.id) {
      throw new Error('Created ClawXpert did not return an xpert id.')
    }

    try {
      await firstValueFrom(
        this.#assistantBindingService.upsert({
          code: AssistantCode.CLAWXPERT,
          scope: AssistantBindingScope.USER,
          assistantId: xpert.id
        })
      )
      this.#pendingCreatedConversationXpertId = xpert.id
      this.#pendingCreatedClawXpert.set(xpert)
      const opened = await this.#router.navigate(['/chat/clawxpert', 'c'])
      if (!opened) {
        throw new Error('Failed to open the ClawXpert conversation.')
      }
    } catch (error) {
      if (this.#pendingCreatedConversationXpertId === xpert.id) {
        this.#pendingCreatedConversationXpertId = null
        this.#pendingCreatedClawXpert.set(null)
      }
      throw error
    }
  }

  readPendingCreatedClawXpert(expectedXpertId?: string | null): IXpert | null {
    const pendingXpert = this.#pendingCreatedClawXpert()
    if (!pendingXpert?.id || (expectedXpertId && pendingXpert.id !== expectedXpertId)) {
      return null
    }

    return pendingXpert
  }

  consumePendingCreatedConversationXpertId(expectedXpertId?: string | null): string | null {
    const pendingXpertId = this.#pendingCreatedConversationXpertId
    if (!pendingXpertId || (expectedXpertId && pendingXpertId !== expectedXpertId)) {
      return null
    }

    this.#pendingCreatedConversationXpertId = null
    return pendingXpertId
  }

  clearPendingCreatedClawXpert(expectedXpertId?: string | null): void {
    const pendingXpert = this.#pendingCreatedClawXpert()
    if (!pendingXpert?.id || (expectedXpertId && pendingXpert.id !== expectedXpertId)) {
      return
    }

    this.#pendingCreatedClawXpert.set(null)
  }

  private async ensureDefaultWorkspace(): Promise<IXpertWorkspace> {
    const defaultWorkspace = await firstValueFrom(this.#workspaceService.getMyDefault({ purpose: 'authoring' }))
    if (defaultWorkspace?.id) {
      return defaultWorkspace
    }

    const createdWorkspace = await firstValueFrom(
      this.#workspaceService.create({
        name: CLAWXPERT_DEFAULT_WORKSPACE_NAME
      })
    )

    if (!createdWorkspace?.id) {
      throw new Error('Default workspace creation did not return an id.')
    }

    const workspace = await firstValueFrom(this.#workspaceService.setMyDefault(createdWorkspace.id))
    this.#workspaceService.refresh()

    return workspace?.id ? workspace : createdWorkspace
  }

  private prepareClawXpertTemplatePlugins(): Promise<void> {
    return this.ensureClawXpertTemplatePlugins().catch(() => {
      this.#toastr.warning('PAC.Chat.ClawXpert.PluginPrepareFailed', {
        Default:
          'ClawXpert was created, but plugin preparation did not finish. Some middleware may appear missing until plugins are installed.'
      })
    })
  }

  private async ensureClawXpertTemplatePlugins(): Promise<void> {
    const template = await firstValueFrom(this.#xpertTemplateService.getTemplate(CLAWXPERT_TEMPLATE_ID))
    const requiredPluginNames = readTemplateRequiredPluginNames(template.dependencies)
    if (!requiredPluginNames.length) {
      return
    }

    const installedPlugins = await firstValueFrom(this.#pluginAPI.getPlugins())
    const installedPluginNames = new Set(
      (installedPlugins ?? [])
        .filter(isUsableInstalledPlugin)
        .flatMap(readInstalledPluginNames)
        .map(normalizePluginInstallName)
        .filter(Boolean)
    )
    const missingPluginNames = requiredPluginNames.filter(
      (pluginName) => !installedPluginNames.has(normalizePluginInstallName(pluginName))
    )

    for (const pluginName of missingPluginNames) {
      await firstValueFrom(this.#pluginAPI.install({ pluginName }))
      installedPluginNames.add(normalizePluginInstallName(pluginName))
    }
    this.#xpertAgentService.refresh()
  }

  private async refreshDraftSnapshotBeforePublish(xpert: IXpert): Promise<void> {
    const latestXpert = await firstValueFrom(
      this.#xpertService.getTeam(xpert.id, {
        relations: ['agent']
      })
    )
    const draft = latestXpert.draft
    const agent = latestXpert.agent
    const sourceKey = draft?.team?.agent?.key

    if (!draft) {
      throw new Error('ClawXpert template installation did not return a draft to publish.')
    }

    if (!agent?.key) {
      throw new Error('ClawXpert template installation did not return a primary agent to publish.')
    }

    if (!sourceKey) {
      throw new Error('ClawXpert draft did not include a primary agent key.')
    }

    const syncedDraft: TXpertTeamDraft = replaceAgentInDraft(draft, sourceKey, agent)
    await firstValueFrom(this.#xpertService.saveDraft(xpert.id, syncedDraft))
  }

  private async publishCreatedXpert(xpert: IXpert): Promise<IXpert> {
    const workspaceId = xpert.workspaceId ?? null
    let environmentId: string | null = null

    if (workspaceId) {
      try {
        environmentId = (await firstValueFrom(this.#environmentService.getDefaultByWorkspace(workspaceId)))?.id ?? null
      } catch {
        environmentId = null
      }
    }

    return firstValueFrom(
      this.#xpertService.publish(xpert.id, false, {
        environmentId,
        releaseNotes: CLAWXPERT_AUTO_PUBLISH_RELEASE_NOTES
      })
    )
  }

  private async publishCreatedXpertOrFallback(xpert: IXpert): Promise<IXpert> {
    try {
      return await this.publishCreatedXpert(xpert)
    } catch {
      this.#toastr.warning('PAC.Xpert.AutoPublishFailed', {
        Default: 'Expert created, but auto publish was not completed. You can continue in Studio.'
      })
      return xpert
    }
  }
}

export function resolveFirstClawXpertLlmModel(
  copilots: ICopilotWithProvider[] | null | undefined
): ICopilotModel | null {
  for (const copilot of copilots ?? []) {
    const model = copilot.providerWithModels?.models?.[0]
    if (copilot.id && model?.model) {
      return {
        copilotId: copilot.id,
        model: model.model,
        modelType: AiModelTypeEnum.LLM
      }
    }
  }

  return null
}

function createClawXpertInstallName() {
  const suffix = uid10()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 6)
    .padEnd(6, '0')

  return `${CLAWXPERT_NAME}-${suffix}`
}

function readInstalledPluginNames(item: IPluginDescriptor): string[] {
  return [item.name, item.packageName, item.meta?.name].filter((value): value is string => typeof value === 'string')
}

function isUsableInstalledPlugin(item: IPluginDescriptor) {
  return item.effectiveInCurrentScope && item.loadStatus !== PLUGIN_LOAD_STATUS.FAILED
}

function readTemplateRequiredPluginNames(dependencies?: XpertTemplatePluginDependencies): string[] {
  const requiredPlugins = new Map<string, string>()

  for (const pluginName of dependencies?.plugins ?? []) {
    const normalized = normalizePluginInstallName(pluginName)
    if (normalized && !requiredPlugins.has(normalized)) {
      requiredPlugins.set(normalized, pluginName.trim())
    }
  }

  return Array.from(requiredPlugins.values())
}

function normalizePluginInstallName(pluginName: string) {
  const normalized = pluginName.trim()
  if (!normalized.includes('@')) {
    return normalized
  }

  const lastAt = normalized.lastIndexOf('@')
  return lastAt > 0 ? normalized.slice(0, lastAt) : normalized
}
