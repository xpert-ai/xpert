import { SandboxManagedServiceErrorCode, TSandboxConfigurable } from '@xpert-ai/contracts'
import { BadRequestException } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { SandboxProviderCreateOptions, SandboxProviderRegistry } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { SandboxAcquireBackendCommand } from '../acquire-backend.command'

type SandboxInstance = {
    configurable: TSandboxConfigurable
}

type SandboxRuntimeConfigurable = TSandboxConfigurable & {
    workspaceBinding?: SandboxProviderCreateOptions['workspaceBinding']
}

@CommandHandler(SandboxAcquireBackendCommand)
export class SandboxAcquireBackendHandler implements ICommandHandler<
    SandboxAcquireBackendCommand,
    TSandboxConfigurable
> {
    private readonly instances = new Map<string, Map<string, SandboxInstance>>()

    constructor(private readonly registry: SandboxProviderRegistry) {}

    find(params: SandboxAcquireBackendCommand['params']): TSandboxConfigurable | null {
        const { workFor, provider, workingDirectory, workspaceBinding, volumeScope } = params
        const protectProjectContent = workFor.type === 'project' || volumeScope?.catalog === 'projects'
        return (
            this.instances
                .get(this.getSessionKey(workFor.type, workFor.id))
                ?.get(this.getInstanceKey(provider, workingDirectory, workspaceBinding, protectProjectContent))
                ?.configurable ?? null
        )
    }

    async execute(command: SandboxAcquireBackendCommand): Promise<TSandboxConfigurable> {
        const { workFor, provider, workingDirectory, workspaceBinding, environmentId, tenantId, volumeScope } =
            command.params
        if (!workFor?.id) {
            throw new Error('Sandbox session id is required')
        }
        if (!provider) {
            throw new Error('Sandbox provider is required')
        }

        const sessionKey = this.getSessionKey(workFor.type, workFor.id)
        const protectProjectContent = workFor.type === 'project' || volumeScope?.catalog === 'projects'
        const instanceKey = this.getInstanceKey(provider, workingDirectory, workspaceBinding, protectProjectContent)
        const sessionMap = this.instances.get(sessionKey) ?? new Map<string, SandboxInstance>()
        const existing = sessionMap.get(instanceKey)
        if (existing) {
            return existing.configurable
        }

        const providerInstance = this.registry.list().find((item) => item.type === provider)
        if (!providerInstance) {
            throw new BadRequestException({
                code: SandboxManagedServiceErrorCode.ProviderUnavailable,
                message: t('server-ai:Error.SandboxProviderNotRegistered', {
                    defaultValue: 'Sandbox provider is not registered: {{provider}}',
                    provider
                })
            })
        }
        if (providerInstance.isAvailable && !(await providerInstance.isAvailable())) {
            const fallbackMessage = 'Sandbox provider is unavailable: ' + provider
            throw new BadRequestException({
                code: SandboxManagedServiceErrorCode.ProviderUnavailable,
                message:
                    t('server-ai:Error.SandboxProviderUnavailable', {
                        defaultValue: fallbackMessage,
                        provider
                    }) || fallbackMessage
            })
        }
        if (protectProjectContent && providerInstance.capabilities?.projectContentReadOnly !== true) {
            const fallbackMessage = 'Sandbox provider ' + provider + ' does not support read-only Project Content'
            throw new BadRequestException({
                code: SandboxManagedServiceErrorCode.UnsupportedProvider,
                message:
                    t('server-ai:Error.SandboxProviderProjectContentReadOnlyUnsupported', {
                        defaultValue: fallbackMessage,
                        provider
                    }) || fallbackMessage
            })
        }
        const backend = await providerInstance.create({
            environmentId,
            tenantId,
            workFor,
            workingDirectory,
            workspaceBinding,
            ...(protectProjectContent ? { protectProjectContent: true as const } : {})
        })
        const configurable: SandboxRuntimeConfigurable = {
            environmentId: environmentId ?? null,
            provider,
            workingDirectory,
            backend
        }
        if (workspaceBinding) {
            configurable.workspaceBinding = workspaceBinding
        }
        sessionMap.set(instanceKey, { configurable })
        this.instances.set(sessionKey, sessionMap)
        return configurable
    }

    private getSessionKey(workForType: string, workForId: string) {
        return `${workForType}:${workForId}`
    }

    private getInstanceKey(
        provider?: string | null,
        workingDirectory?: string | null,
        workspaceBinding?: SandboxProviderCreateOptions['workspaceBinding'],
        protectProjectContent = false
    ) {
        const workspaceIdentity = this.getWorkspaceBindingIdentity(workspaceBinding)
        return `${provider ?? '__default__'}:${workingDirectory ?? '__default__'}:${workspaceIdentity}:${protectProjectContent}`
    }

    private getWorkspaceBindingIdentity(workspaceBinding?: SandboxProviderCreateOptions['workspaceBinding']) {
        if (!workspaceBinding) {
            return ''
        }

        return JSON.stringify([
            workspaceBinding.volumeRoot ?? '',
            workspaceBinding.bindSource ?? '',
            workspaceBinding.workspaceRoot ?? '',
            workspaceBinding.containerMountPath ?? '',
            workspaceBinding.workspacePath ?? ''
        ])
    }
}
