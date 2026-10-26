import type { IPluginConfig } from '@xpert-ai/server-common'

export function readPluginInstallationConfig(
  environment: NodeJS.ProcessEnv
): IPluginConfig['pluginInstallationOptions'] {
  const bounded = (value: string | undefined, fallback: number) => {
    const parsed = Number(value)
    return Number.isSafeInteger(parsed) && parsed >= 1000 && parsed <= 600_000 ? parsed : fallback
  }
  return {
    timeoutMs: bounded(environment.PLUGIN_INSTALL_TIMEOUT_MS, 120_000),
    lockWaitMs: bounded(environment.PLUGIN_INSTALL_LOCK_WAIT_MS, 180_000)
  }
}
