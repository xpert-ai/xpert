import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { SandboxBackendProtocol, SandboxProviderRegistry } from '@xpert-ai/plugin-sdk'

type SandboxInstance = {
  backend: SandboxBackendProtocol
  workingDirectory: string
}

@Injectable()
export class SandboxService {
  private readonly logger = new Logger(SandboxService.name)
  private readonly instances = new Map<string, Map<string, SandboxInstance>>()

  constructor(private readonly registry: SandboxProviderRegistry) {}

  listProviders() {
    return this.registry.list().map((provider) => ({
      type: provider.type,
      meta: provider.meta
    }))
  }

  getDefaultProviderType(): string | null {
    return this.registry.list()[0]?.type ?? null
  }

  async getOrCreateBackend(params: {
    sessionId: string
    provider: string
    workingDirectory?: string
  }): Promise<SandboxBackendProtocol> {
    const { sessionId, provider, workingDirectory } = params
    if (!sessionId) {
      throw new Error('Sandbox session id is required')
    }

    const sessionMap = this.instances.get(sessionId) ?? new Map<string, SandboxInstance>()
    const existing = sessionMap.get(provider)
    if (existing) {
      return existing.backend
    }

    const providerInstance = this.registry.get(provider)
    const backend = await providerInstance.create({ workingDirectory })
    sessionMap.set(provider, { backend, workingDirectory })
    this.instances.set(sessionId, sessionMap)
    return backend
  }

  @Cron('0 0 * * * *')
  cleanCron() {
    this.logger.debug('Called when the current second is 45')
  }
}
