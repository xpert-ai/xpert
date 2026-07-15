import { createHash } from 'node:crypto'
import path from 'node:path'
import {
    ISandboxProvider,
    SandboxProviderCreateOptions,
    SandboxProviderStrategy,
    SandboxWorkspaceMapperStrategy,
    type SandboxWorkspaceBinding,
    type SandboxWorkspaceMapper,
    type SandboxWorkspaceMappingOptions,
    type SandboxWorkspaceVolume
} from '@xpert-ai/plugin-sdk'
import type { TSandboxProviderMeta } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { NsjailRunnerClient } from './nsjail-runner.client'
import { getNsjailMessage } from './nsjail-i18n'
import { NsjailSandbox } from './nsjail-sandbox'

export const NSJAIL_SANDBOX_PROVIDER = 'nsjail'
const NSJAIL_DEFAULT_WORKING_DIRECTORY = '/workspace'
const RUNNER_HEALTH_CACHE_MS = 5_000

const NSJAIL_SANDBOX_ICON = `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><path d="M10 21h28v21H10z" fill="none" stroke="currentColor" stroke-width="3"/><path d="M16 21v-5a8 8 0 0 1 16 0v5" fill="none" stroke="currentColor" stroke-width="3"/><path d="M24 28v7" stroke="currentColor" stroke-linecap="round" stroke-width="3"/></svg>`

function readRunnerConfig() {
    const baseUrl = process.env.NSJAIL_RUNNER_URL?.trim() ?? ''
    const token = process.env.NSJAIL_RUNNER_TOKEN?.trim() ?? ''
    return { baseUrl, token }
}

function normalizeWorkingDirectory(workingDirectory: string): string {
    const normalized = path.posix.normalize(workingDirectory)
    return normalized === '/' ? normalized : normalized.replace(/\/+$/, '')
}

function createRuntimeId(
    options: SandboxProviderCreateOptions,
    workspacePath: string,
    workingDirectory: string
): string {
    return createHash('sha256')
        .update(
            JSON.stringify([
                options.tenantId ?? '',
                options.workFor.type,
                options.workFor.id,
                options.environmentId ?? '',
                workspacePath,
                workingDirectory
            ])
        )
        .digest('hex')
        .slice(0, 32)
}

@Injectable()
@SandboxProviderStrategy(NSJAIL_SANDBOX_PROVIDER)
export class NsjailSandboxProvider implements ISandboxProvider<NsjailSandbox> {
    private healthCache: { available: boolean; configKey: string; expiresAt: number } | null = null
    private healthRequest: { configKey: string; promise: Promise<boolean> } | null = null

    readonly type = NSJAIL_SANDBOX_PROVIDER

    readonly meta: TSandboxProviderMeta = {
        name: {
            en_US: 'NsJail Sandbox',
            zh_Hans: 'NsJail 沙盒'
        },
        description: {
            en_US: 'A Linux process sandbox isolated by a dedicated NsJail Runner.',
            zh_Hans: '通过独立 NsJail Runner 隔离运行 Linux 进程的沙盒。'
        },
        icon: {
            type: 'svg',
            value: NSJAIL_SANDBOX_ICON
        }
    }

    async isAvailable(): Promise<boolean> {
        const config = readRunnerConfig()
        if (!config.baseUrl || !config.token) {
            return false
        }

        const configKey = `${config.baseUrl}\u0000${config.token}`
        if (this.healthCache?.configKey === configKey && this.healthCache.expiresAt > Date.now()) {
            return this.healthCache.available
        }
        if (this.healthRequest?.configKey === configKey) {
            return this.healthRequest.promise
        }

        const promise = new NsjailRunnerClient(config)
            .isHealthy()
            .catch(() => false)
            .then((available) => {
                this.healthCache = {
                    available,
                    configKey,
                    expiresAt: Date.now() + RUNNER_HEALTH_CACHE_MS
                }
                return available
            })
            .finally(() => {
                if (this.healthRequest?.configKey === configKey) {
                    this.healthRequest = null
                }
            })
        this.healthRequest = { configKey, promise }
        return promise
    }

    async create(options?: SandboxProviderCreateOptions): Promise<NsjailSandbox> {
        if (!options) {
            throw new Error(
                getNsjailMessage('NsJailCreateOptionsRequired', 'NsJail sandbox create options are required.')
            )
        }
        const config = readRunnerConfig()
        if (!config.baseUrl || !config.token) {
            throw new Error(
                getNsjailMessage(
                    'NsJailRunnerNotConfigured',
                    'NsJail Runner is not configured. Set NSJAIL_RUNNER_URL and NSJAIL_RUNNER_TOKEN.'
                )
            )
        }
        if (!options.workspaceBinding?.volumeRoot) {
            throw new Error(
                getNsjailMessage(
                    'NsJailWorkspaceBindingRequired',
                    'NsJail sandbox requires an explicit workspace binding.'
                )
            )
        }
        if (!(await this.isAvailable())) {
            throw new Error(
                getNsjailMessage(
                    'NsJailRunnerUnavailable',
                    'NsJail Runner is not healthy or rejected the configured token.'
                )
            )
        }

        const workingDirectory = normalizeWorkingDirectory(options.workingDirectory ?? this.getDefaultWorkingDir())
        const workspacePath = options.workspaceBinding.volumeRoot
        const runtimeId = createRuntimeId(options, workspacePath, workingDirectory)
        const client = new NsjailRunnerClient(config)
        await client.createRuntime({
            runtimeId,
            workingDirectory,
            workspacePath
        })

        return new NsjailSandbox({
            client,
            environmentId: options.environmentId,
            runtimeId,
            workspacePath,
            workingDirectory
        })
    }

    getDefaultWorkingDir(): string {
        return NSJAIL_DEFAULT_WORKING_DIRECTORY
    }
}

@Injectable()
@SandboxWorkspaceMapperStrategy(NSJAIL_SANDBOX_PROVIDER)
export class NsjailWorkspacePathMapper implements SandboxWorkspaceMapper {
    mapVolumeToWorkspace(
        volume: SandboxWorkspaceVolume,
        options?: SandboxWorkspaceMappingOptions
    ): SandboxWorkspaceBinding {
        const serverPath = options?.serverPath ?? volume.serverRoot
        const relativePath = path.relative(volume.serverRoot, serverPath).replace(/\\/g, '/')
        if (relativePath.startsWith('..') || path.posix.isAbsolute(relativePath)) {
            throw new Error(
                getNsjailMessage(
                    'NsJailWorkspacePathOutsideVolume',
                    'Resolved workspace path is outside of the mapped volume root'
                )
            )
        }

        return {
            bindSource: volume.hostRoot,
            containerMountPath: NSJAIL_DEFAULT_WORKING_DIRECTORY,
            volumeRoot: volume.serverRoot,
            workspaceRoot: NSJAIL_DEFAULT_WORKING_DIRECTORY,
            workspacePath:
                relativePath && relativePath !== '.'
                    ? path.posix.join(NSJAIL_DEFAULT_WORKING_DIRECTORY, relativePath)
                    : NSJAIL_DEFAULT_WORKING_DIRECTORY
        }
    }

    mapWorkspaceToVolume(binding: SandboxWorkspaceBinding, workspacePath: string): string {
        const normalizedWorkspaceRoot = path.posix.normalize(binding.workspaceRoot)
        const normalizedWorkspacePath = path.posix.normalize(workspacePath)
        const relativePath = path.posix.relative(normalizedWorkspaceRoot, normalizedWorkspacePath)
        if (relativePath.startsWith('..') || path.posix.isAbsolute(relativePath)) {
            throw new Error(
                getNsjailMessage(
                    'NsJailWorkspacePathOutsideMount',
                    'Resolved workspace path is outside of the mounted workspace root'
                )
            )
        }

        return relativePath && relativePath !== '.' ? path.join(binding.volumeRoot, relativePath) : binding.volumeRoot
    }
}
