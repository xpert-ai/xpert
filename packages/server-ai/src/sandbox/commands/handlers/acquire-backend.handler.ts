import { TSandboxConfigurable } from '@metad/contracts'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { SandboxProviderRegistry } from '@xpert-ai/plugin-sdk'
import { SandboxAcquireBackendCommand } from '../acquire-backend.command'

type SandboxInstance = {
    configurable: TSandboxConfigurable
}

@CommandHandler(SandboxAcquireBackendCommand)
export class SandboxAcquireBackendHandler
    implements ICommandHandler<SandboxAcquireBackendCommand, TSandboxConfigurable>
{
    private readonly instances = new Map<string, Map<string, SandboxInstance>>()

    constructor(private readonly registry: SandboxProviderRegistry) {}

    async execute(command: SandboxAcquireBackendCommand): Promise<TSandboxConfigurable> {
        const { workFor, provider, workingDirectory } = command.params
        if (!workFor?.id) {
            throw new Error('Sandbox session id is required')
        }
        if (!provider) {
            throw new Error('Sandbox provider is required')
        }

        const sessionKey = this.getSessionKey(workFor.type, workFor.id)
        const instanceKey = this.getInstanceKey(provider, workingDirectory)
        const sessionMap = this.instances.get(sessionKey) ?? new Map<string, SandboxInstance>()
        const existing = sessionMap.get(instanceKey)
        if (existing) {
            return existing.configurable
        }

        const providerInstance = this.registry.get(provider)
        const backend = await providerInstance.create({ workingDirectory, workFor, tenantId: command.params.tenantId })
        const configurable: TSandboxConfigurable = {
            provider,
            workingDirectory,
            backend
        }
        sessionMap.set(instanceKey, { configurable })
        this.instances.set(sessionKey, sessionMap)
        return configurable
    }

    private getSessionKey(workForType: string, workForId: string) {
        return `${workForType}:${workForId}`
    }

    private getInstanceKey(provider?: string | null, workingDirectory?: string | null) {
        return `${provider ?? '__default__'}:${workingDirectory ?? '__default__'}`
    }
}
