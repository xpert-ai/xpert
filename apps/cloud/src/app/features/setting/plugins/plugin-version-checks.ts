import { signal, type WritableSignal } from '@angular/core'
import type { IPluginDescriptor, IPluginLatestVersionStatus, PluginVersionCheckResult } from '@xpert-ai/contracts'

export function pluginVersionCheckKey(plugin: Pick<IPluginDescriptor, 'scopeKey' | 'organizationId' | 'name'>) {
  return `${plugin.scopeKey ?? plugin.organizationId ?? ''}:${plugin.name}`
}

/** A scope or list change invalidates in-flight checks before they can update the new view. */
export class PluginVersionChecks<T extends IPluginDescriptor> {
  readonly states = signal<Record<string, { checking: boolean; result?: PluginVersionCheckResult }>>({})
  private revision = 0

  constructor(
    private readonly plugins: WritableSignal<T[]>,
    private readonly fetchVersions: (names: string[], forceRefresh: boolean) => Promise<IPluginLatestVersionStatus[]>
  ) {}

  reset() {
    this.revision += 1
    this.states.set({})
  }

  async check(plugin: T) {
    if (!plugin.canUpdate || plugin.updateUnavailableReason || this.states()[pluginVersionCheckKey(plugin)]?.checking) {
      return
    }
    await this.load([plugin.name], true)
  }

  async load(names: string[], forceRefresh = false) {
    const revision = this.revision
    const targets = this.plugins().filter(
      (plugin) => names.includes(plugin.name) && plugin.canUpdate && !plugin.updateUnavailableReason
    )
    if (!targets.length) return
    const targetKeys = new Set(targets.map(pluginVersionCheckKey))
    this.states.update((checks) => ({
      ...checks,
      ...Object.fromEntries([...targetKeys].map((key) => [key, { ...checks[key], checking: true }]))
    }))
    this.plugins.update((plugins) =>
      plugins.map((plugin) =>
        targetKeys.has(pluginVersionCheckKey(plugin)) ? { ...plugin, hasUpdate: false } : plugin
      )
    )
    try {
      const statuses = await this.fetchVersions([...new Set(targets.map((plugin) => plugin.name))], forceRefresh)
      if (revision !== this.revision) return
      const byKey = new Map(statuses.map((status) => [pluginVersionCheckKey(status), status]))
      this.states.update((checks) => ({
        ...checks,
        ...Object.fromEntries(
          [...targetKeys].map((key) => [
            key,
            { checking: false, result: byKey.get(key)?.check ?? failedCheck(checks[key]?.result) }
          ])
        )
      }))
      this.plugins.update((plugins) =>
        plugins.map((plugin) => {
          const key = pluginVersionCheckKey(plugin)
          const status = targetKeys.has(key) ? byKey.get(key) : undefined
          return status
            ? {
                ...plugin,
                latestVersion: status.latestVersion,
                hasUpdate: status.check?.status === 'success' && status.hasUpdate
              }
            : plugin
        })
      )
    } catch {
      if (revision !== this.revision) return
      this.states.update((checks) => ({
        ...checks,
        ...Object.fromEntries(
          [...targetKeys].map((key) => [key, { checking: false, result: failedCheck(checks[key]?.result) }])
        )
      }))
    }
  }
}

function failedCheck(previous?: PluginVersionCheckResult): PluginVersionCheckResult {
  return {
    status: 'failed',
    errorCode: 'REGISTRY_UNAVAILABLE',
    checkedAt: new Date().toISOString(),
    latestVersion: previous?.latestVersion,
    lastSuccessfulCheckAt: previous?.lastSuccessfulCheckAt
  }
}
