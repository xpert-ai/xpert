// A dedicated production Jobs provider; interactive Sandbox selection and network policy do not apply.
import { Injectable } from '@nestjs/common'
import {
    SandboxRuntimeProviderStrategy,
    type ISandboxRuntimeProvider,
    type SandboxRuntimeBinding,
    type SandboxRuntimeCreateOptions,
    type SandboxRuntimeDefinition,
    type SandboxRuntimeDestroyOptions,
    type SandboxRuntimeInstance
} from '@xpert-ai/plugin-sdk'
import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import {
    COMPUTE_RUNTIME_PROFILE,
    SandboxRuntimeDefinitionRegistry
} from '../../sandbox-job/sandbox-runtime-definition.registry'
import {
    COMPUTE_OUTPUT_LIMIT,
    NSJAIL_COMPUTE_BINDING,
    NSJAIL_COMPUTE_PROVIDER,
    NSJAIL_COMPUTE_VERSION,
    computeConfig,
    computeUnavailable,
    invalidComputePolicy
} from './compute-contract'
import { NsjailComputeClient } from './compute-runner.client'

@Injectable()
@SandboxRuntimeProviderStrategy(NSJAIL_COMPUTE_PROVIDER)
export class NsjailComputeRuntimeProvider implements ISandboxRuntimeProvider {
    readonly type = NSJAIL_COMPUTE_PROVIDER
    readonly version = NSJAIL_COMPUTE_VERSION
    readonly capabilities = {
        isolation: 'hardened' as const,
        ephemeral: true,
        resourceLimits: true,
        networkPolicy: true,
        readOnlyRootFilesystem: true,
        readOnlyWorkspace: true,
        readOnlyFileMounts: false
    }

    constructor(private readonly definitions: SandboxRuntimeDefinitionRegistry) {}

    listBindings(): SandboxRuntimeBinding[] {
        return computeConfig() ? [this.binding()] : []
    }

    async getBindingHealth(input: { definition: SandboxRuntimeDefinition; binding: SandboxRuntimeBinding }) {
        try {
            this.assertDefinition(input.definition, input.binding)
            return { available: true, manifest: await this.client().health(input.definition) }
        } catch {
            return { available: false, reason: computeUnavailable().message }
        }
    }

    async create(options: SandboxRuntimeCreateOptions): Promise<SandboxRuntimeInstance> {
        this.assertDefinition(options.definition, options.binding)
        const definition = options.definition
        if (
            !options.ephemeral ||
            options.workFor.type !== 'job' ||
            options.readOnlyFiles?.length ||
            !isDeepStrictEqual(options.resources, definition.resources) ||
            !isDeepStrictEqual(options.networkPolicy, definition.networkPolicy) ||
            !isDeepStrictEqual(options.security, definition.security) ||
            options.hardDeadlineMs !== definition.hardDeadlineMs
        )
            throw invalidComputePolicy()
        const id = this.runtimeId(options.tenantId, options.workFor.id)
        const client = this.client()
        await client.create(id, definition)
        const trusted = [
            ...definition.command,
            '--request',
            '/workspace/input/job.json',
            '--output',
            '/workspace/output',
            '--action-root',
            '/workspace/runtime/action',
            '--action-manifest',
            '/workspace/runtime/action-manifest.json'
        ]
        return {
            id,
            workspaceRoot: '/workspace',
            execute: (argv, execution = {}) => {
                if (!isDeepStrictEqual([...argv], trusted)) throw invalidComputePolicy()
                const timeoutMs = execution.timeoutMs ?? definition.timeoutMs
                const maxOutputBytes = execution.maxOutputBytes ?? COMPUTE_OUTPUT_LIMIT
                if (
                    !Number.isSafeInteger(timeoutMs) ||
                    timeoutMs < 1 ||
                    timeoutMs > definition.hardDeadlineMs ||
                    !Number.isSafeInteger(maxOutputBytes) ||
                    maxOutputBytes < 1 ||
                    maxOutputBytes > COMPUTE_OUTPUT_LIMIT
                )
                    throw invalidComputePolicy()
                return client.execute(id, timeoutMs, maxOutputBytes, execution.onOutput)
            },
            uploadFiles: (files) => client.upload(id, files),
            downloadFiles: (paths) => client.download(id, paths),
            terminate: () => client.terminate(id)
        }
    }

    async destroy(options: SandboxRuntimeDestroyOptions): Promise<void> {
        const binding = this.binding()
        const id = this.runtimeId(options.tenantId, options.workFor.id)
        if (
            options.workFor.type !== 'job' ||
            options.runtimeProfile !== binding.runtimeProfile ||
            options.runtimeBindingId !== binding.id ||
            !isDeepStrictEqual(options.artifact, binding.artifact) ||
            (options.runtimeRef && options.runtimeRef !== id)
        )
            throw invalidComputePolicy()
        await this.client().destroy(id)
    }

    private binding(): SandboxRuntimeBinding {
        const definition = this.definitions.require(COMPUTE_RUNTIME_PROFILE)
        const digest = `sha256:${definition.expectedManifest.runnerHostSha256}`
        return {
            id: NSJAIL_COMPUTE_BINDING,
            provider: this.type,
            providerVersion: this.version,
            runtimeProfile: definition.name,
            priority: 100,
            artifact: {
                kind: 'remote-runtime',
                reference: `nsjail://compute/node-python/v1/${definition.sandboxRuntimeVersion}@${digest}`,
                digest
            }
        }
    }

    private assertDefinition(definition: SandboxRuntimeDefinition, binding: SandboxRuntimeBinding): void {
        if (
            !isDeepStrictEqual(definition, this.definitions.require(COMPUTE_RUNTIME_PROFILE)) ||
            !isDeepStrictEqual(binding, this.binding())
        )
            throw invalidComputePolicy()
    }

    private runtimeId(tenantId: string, jobId: string): string {
        if (!tenantId || !jobId || tenantId.length > 256 || jobId.length > 256) throw invalidComputePolicy()
        return createHash('sha256')
            .update(JSON.stringify([this.binding().artifact.reference, tenantId, jobId]))
            .digest('hex')
    }

    private client(): NsjailComputeClient {
        const config = computeConfig()
        if (!config) throw computeUnavailable()
        return new NsjailComputeClient(config)
    }
}
