import { TSandboxConfigurable } from '@metad/contracts'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { SandboxBackendProtocol, SandboxProviderRegistry } from '@xpert-ai/plugin-sdk'
import { SandboxAcquireBackendCommand } from '../acquire-backend.command'

type SandboxInstance = {
    backend: SandboxBackendProtocol
    workingDirectory: string
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

        const sessionMap = this.instances.get(workFor.id) ?? new Map<string, SandboxInstance>()
        const existing = sessionMap.get(provider)
        if (existing) {
            return existing.backend
        }

        const providerInstance = this.registry.get(provider)
        const backend = await providerInstance.create({ workingDirectory, workFor, tenantId: command.params.tenantId })
        sessionMap.set(provider, { backend, workingDirectory })
        this.instances.set(workFor.id, sessionMap)
        return backend
    }
}
