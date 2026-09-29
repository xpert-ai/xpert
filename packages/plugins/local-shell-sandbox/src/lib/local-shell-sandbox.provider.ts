import cp from 'node:child_process'
import path from 'node:path'
import { Injectable } from '@nestjs/common'
import { t } from 'i18next'
import { SandboxProviderStrategy } from '@xpert-ai/plugin-sdk'
import type { ISandboxProvider, SandboxProviderCreateOptions } from '@xpert-ai/plugin-sdk'
import type { TSandboxProviderMeta } from '@xpert-ai/contracts'
import { LocalShellSandbox } from './local-shell-sandbox'
import { LOCAL_SHELL_SANDBOX_ICON } from './icon'

// Keep the existing identifier so saved Assistant sandbox settings remain compatible.
export const LOCAL_SHELL_SANDBOX_PROVIDER = 'local-shell-sandbox'
export { LocalShellSandbox } from './local-shell-sandbox'

@Injectable()
@SandboxProviderStrategy(LOCAL_SHELL_SANDBOX_PROVIDER)
export class LocalShellSandboxProvider implements ISandboxProvider<LocalShellSandbox> {
  readonly type = LOCAL_SHELL_SANDBOX_PROVIDER

  readonly meta: TSandboxProviderMeta = {
    name: {
      en_US: 'Local Shell Sandbox',
      zh_Hans: '本地 Shell 沙盒'
    },
    description: {
      en_US: 'A sandbox that executes shell commands locally on the host machine.',
      zh_Hans: '在主机本地执行 shell 命令的沙盒。'
    },
    icon: {
      type: 'svg',
      value: LOCAL_SHELL_SANDBOX_ICON
    }
  }

  isAvailable(): boolean {
    return process.env.XPERT_LOCAL_SANDBOX_ENABLED?.trim().toLowerCase() === 'true'
  }

  async create(options?: SandboxProviderCreateOptions): Promise<LocalShellSandbox> {
    if (!this.isAvailable()) {
      const fallbackMessage = 'Sandbox provider is unavailable: ' + this.type
      throw new Error(
        t('server-ai:Error.SandboxProviderUnavailable', {
          defaultValue: fallbackMessage,
          provider: this.type
        }) || fallbackMessage
      )
    }
    if (options?.workFor.type === 'job' && process.env.NODE_ENV === 'production') {
      throw new Error('Local Shell Sandbox Jobs are disabled in production.')
    }
    return new LocalShellSandbox({
      workingDirectory: options?.workingDirectory ?? this.getDefaultWorkingDir()
    })
  }

  async getProfileHealth(input: {
    profile: string
    image?: string
    manifestCommand?: readonly string[]
    expectedManifest?: Record<string, string>
  }): Promise<{ available: boolean; reason?: string; manifest?: Record<string, string> }> {
    if (process.env.NODE_ENV === 'production') {
      return { available: false, reason: 'Local Shell Sandbox Job profiles are disabled in production.' }
    }
    const [executable, ...args] = input.manifestCommand ?? []
    if (!executable) return { available: false, reason: `Profile ${input.profile} has no manifest command configured.` }
    try {
      const parsed: unknown = JSON.parse(cp.execFileSync(executable, args, { encoding: 'utf8' }))
      if (!isStringRecord(parsed))
        return { available: false, reason: `Profile ${input.profile} returned an invalid manifest.` }
      const manifest = parsed
      const mismatch = Object.entries(input.expectedManifest ?? {}).find(([key, value]) => manifest[key] !== value)
      return mismatch
        ? {
            available: false,
            reason: `Runner manifest ${mismatch[0]} does not match ${mismatch[1]}.`,
            manifest
          }
        : { available: true, manifest }
    } catch (error) {
      return { available: false, reason: error instanceof Error ? error.message : String(error) }
    }
  }

  getDefaultWorkingDir(): string {
    return path.resolve(process.cwd(), 'sandbox')
  }
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.values(value).every((item) => typeof item === 'string')
  )
}
