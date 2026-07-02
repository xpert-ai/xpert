import { Dialog } from '@angular/cdk/dialog'
import { inject, Injectable } from '@angular/core'
import { Router } from '@angular/router'
import { firstValueFrom } from 'rxjs'
import {
  type IPluginResourceComponentState,
  type IPluginResourceInstallResult,
  type IPluginResourceInstallation,
  injectPluginAPI,
  PLUGIN_COMPONENT_TYPE,
  PLUGIN_LEVEL,
  PLUGIN_RESOURCE_INSTALLATION_STATUS,
  PLUGIN_RESOURCE_RUNTIME_TYPE,
  type PluginComponentType
} from '@xpert-ai/cloud/state'
import { type I18nObject, type PluginMeta } from '@xpert-ai/contracts'
import { ClawXpertBindingTargetService } from '../../../chat/clawxpert/clawxpert-binding-target.service'
import { ClawXpertSkillTrialIntentService } from '../../../chat/clawxpert/clawxpert-skill-trial-intent.service'
import { PluginResourcesComponent } from '../resources/resources.component'
import { type TInstalledPlugin, type TPluginWithDownloads } from '../types'

export type PluginSkillTrialResource = {
  name: string
  componentType: PluginComponentType
}

export type PluginSkillTrialLaunchInput = {
  plugin: TPluginWithDownloads
  resource: PluginSkillTrialResource
  label: string
  prompt?: string | null
}

export type PluginSkillResourceInstallInput = {
  plugin: TPluginWithDownloads
  resource: PluginSkillTrialResource
  closeOnSuccess?: boolean
  reload?: () => void
}

type SkillInstallTarget = {
  workspaceId: string
  skillPackageId: string
}

@Injectable({ providedIn: 'root' })
export class PluginSkillTrialLauncherService {
  readonly #dialog = inject(Dialog)
  readonly #router = inject(Router)
  readonly #pluginAPI = injectPluginAPI()
  readonly #clawXpertBindingTarget = inject(ClawXpertBindingTargetService)
  readonly #skillTrialIntent = inject(ClawXpertSkillTrialIntentService)

  async openInstallDialog(input: PluginSkillResourceInstallInput) {
    const plugin = toInstalledPlugin(input.plugin)
    if (!plugin || input.resource.componentType !== PLUGIN_COMPONENT_TYPE.SKILL) {
      return null
    }

    const workspaceId = await this.resolveClawXpertWorkspaceId()
    const dialogRef = this.#dialog.open(PluginResourcesComponent, {
      data: {
        plugin,
        initialComponents: [
          {
            componentType: PLUGIN_COMPONENT_TYPE.SKILL,
            componentKey: input.resource.name
          }
        ],
        initialWorkspaceId: workspaceId ?? undefined,
        initialInstallMode: 'workspace',
        closeOnSuccess: input.closeOnSuccess === true,
        reload: input.reload
      },
      backdropClass: 'backdrop-blur-sm-black'
    })

    const result = (await firstValueFrom(dialogRef.closed)) as IPluginResourceInstallResult | null | undefined
    input.reload?.()
    return result ?? null
  }

  async tryInClawXpert(input: PluginSkillTrialLaunchInput) {
    const pluginName = resolvePluginName(input.plugin)
    const workspaceId = await this.resolveClawXpertWorkspaceId()
    if (!pluginName || input.resource.componentType !== PLUGIN_COMPONENT_TYPE.SKILL) {
      return false
    }

    if (!workspaceId) {
      await this.openClawXpertSetup()
      return true
    }

    const target =
      (await this.resolveFreshInstalledSkillTarget(pluginName, input.resource.name, workspaceId)) ??
      (await this.installSkillForTrial(input, workspaceId)) ??
      (await this.resolveFreshInstalledSkillTarget(pluginName, input.resource.name, workspaceId))
    if (!target) {
      return false
    }

    this.#skillTrialIntent.set({
      workspaceId: target.workspaceId,
      skillPackageId: target.skillPackageId,
      label: input.label,
      prompt: normalizeOptionalString(input.prompt)
    })
    await this.#router.navigate(['/chat/clawxpert', 'c'])
    return true
  }

  private openClawXpertSetup() {
    return this.#router.navigate(['/chat/clawxpert'], {
      queryParams: {
        onboarding: 'clawxpert'
      }
    })
  }

  private async resolveClawXpertWorkspaceId() {
    const target = await firstValueFrom(this.#clawXpertBindingTarget.getCurrentUserTarget())
    return target?.workspaceId ?? null
  }

  private async resolveFreshInstalledSkillTarget(pluginName: string, componentKey: string, workspaceId: string) {
    try {
      const result = await firstValueFrom(
        this.#pluginAPI.getPluginResourceStates(pluginName, {
          target: 'workspace',
          workspaceId
        })
      )
      return this.resolveInstalledSkillTargetFromStates(result.items ?? [], componentKey, workspaceId)
    } catch {
      return null
    }
  }

  private async installSkillForTrial(input: PluginSkillTrialLaunchInput, workspaceId: string) {
    const result = await this.openInstallDialog({
      plugin: input.plugin,
      resource: input.resource,
      closeOnSuccess: true
    })
    if (!result) {
      return null
    }
    return this.resolveInstallResultTarget(result, input.resource.name, workspaceId)
  }

  private resolveInstalledSkillTargetFromStates(
    states: IPluginResourceComponentState[],
    componentKey: string,
    fallbackWorkspaceId: string
  ) {
    return this.resolveInstalledSkillTargetFromState(
      states.find((state) => this.isReadySkillState(state, componentKey)),
      fallbackWorkspaceId
    )
  }

  private resolveInstalledSkillTargetFromState(
    state: IPluginResourceComponentState | null | undefined,
    fallbackWorkspaceId: string
  ): SkillInstallTarget | null {
    const workspaceId = state?.installation?.workspaceId ?? fallbackWorkspaceId
    const skillPackageId = state?.runtimeId ?? state?.installation?.runtimeId
    return workspaceId && skillPackageId ? { workspaceId, skillPackageId } : null
  }

  private isReadySkillState(state: IPluginResourceComponentState, componentKey: string) {
    return (
      state.componentType === PLUGIN_COMPONENT_TYPE.SKILL &&
      state.componentKey === componentKey &&
      state.installed &&
      !state.staleDefinition &&
      state.status === PLUGIN_RESOURCE_INSTALLATION_STATUS.READY &&
      !!(state.runtimeId ?? state.installation?.runtimeId)
    )
  }

  private resolveInstallResultTarget(
    result: IPluginResourceInstallResult,
    componentKey: string,
    fallbackWorkspaceId: string
  ): SkillInstallTarget | null {
    const installation = result.installations.find((item) => this.isMatchingSkillInstallation(item, componentKey))
    if (!installation?.runtimeId) {
      return null
    }
    return {
      workspaceId: installation.workspaceId ?? fallbackWorkspaceId,
      skillPackageId: installation.runtimeId
    }
  }

  private isMatchingSkillInstallation(installation: IPluginResourceInstallation, componentKey: string) {
    return (
      installation.componentType === PLUGIN_COMPONENT_TYPE.SKILL &&
      installation.componentKey === componentKey &&
      installation.runtimeType === PLUGIN_RESOURCE_RUNTIME_TYPE.SKILL_PACKAGE &&
      !!installation.runtimeId
    )
  }
}

function toInstalledPlugin(plugin: TPluginWithDownloads): TInstalledPlugin | null {
  const pluginName = resolvePluginName(plugin)
  if (!pluginName || !plugin.installed) {
    return null
  }

  return {
    name: pluginName,
    packageName: pluginName,
    meta: {
      name: pluginName,
      displayName: readI18nText(plugin.displayName) ?? pluginName,
      description: readI18nText(plugin.description) ?? pluginName,
      version: plugin.version ?? undefined,
      category: normalizePluginCategory(plugin.category),
      icon: plugin.icon,
      author: plugin.author?.name,
      homepage: plugin.author?.url
    },
    currentVersion: plugin.version,
    loadStatus: 'loaded',
    isGlobal: false,
    level: PLUGIN_LEVEL.ORGANIZATION,
    effectiveInCurrentScope: true
  } satisfies TInstalledPlugin
}

function resolvePluginName(plugin: TPluginWithDownloads) {
  return normalizeOptionalString(plugin.packageName) ?? normalizeOptionalString(plugin.name)
}

function normalizeOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readI18nText(value: I18nObject | string | undefined) {
  if (typeof value === 'string') {
    return value.trim() ? value.trim() : null
  }
  if (!value || typeof value !== 'object') {
    return null
  }
  return (
    normalizeOptionalString(value.en_US) ??
    normalizeOptionalString(value.zh_Hans) ??
    Object.values(value).find((item): item is string => typeof item === 'string' && !!item.trim()) ??
    null
  )
}

function normalizePluginCategory(value: string | undefined): PluginMeta['category'] {
  if (
    value === 'agent' ||
    value === 'doc-source' ||
    value === 'tools' ||
    value === 'model' ||
    value === 'vlm' ||
    value === 'vector-store' ||
    value === 'integration' ||
    value === 'datasource' ||
    value === 'database' ||
    value === 'middleware'
  ) {
    return value
  }
  return 'integration'
}
