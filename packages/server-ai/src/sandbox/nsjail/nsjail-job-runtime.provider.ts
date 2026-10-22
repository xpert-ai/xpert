// A dedicated production Jobs provider; interactive Sandbox selection and network policy do not apply.
import {
    type ISandboxRuntimeProvider,
    type SandboxRuntimeBinding,
    type SandboxRuntimeCreateOptions,
    type SandboxRuntimeDefinition,
    type SandboxRuntimeDestroyOptions,
    type SandboxRuntimeInstance
} from '@xpert-ai/plugin-sdk'
import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { SandboxRuntimeDefinitionRegistry } from '../sandbox-job/sandbox-runtime-definition.registry'
import {
    COMPUTE_OUTPUT_LIMIT,
    computeConfig,
    computeUnavailable,
    invalidComputePolicy
} from './compute/compute-contract'
import { NsjailComputeClient } from './compute/compute-runner.client'

export type NsjailJobProfile = {
    name: string
    bindingId: string
    route: string
    healthTimeoutMs: number
    digest: 'runner' | 'manifest'
}

export abstract class NsjailJobRuntimeProvider implements ISandboxRuntimeProvider {
    readonly version = '1.0.0'
    readonly capabilities = {
        isolation: 'hardened' as const,
        ephemeral: true,
        resourceLimits: true,
        networkPolicy: true,
        readOnlyRootFilesystem: true,
        readOnlyWorkspace: true,
        readOnlyFileMounts: false
    }

    constructor(
        private readonly definitions: SandboxRuntimeDefinitionRegistry,
        readonly type: string,
        private readonly profiles: readonly NsjailJobProfile[],
        private readonly unavailable = computeUnavailable,
        private readonly invalidPolicy = invalidComputePolicy
    ) {}

    listBindings(): SandboxRuntimeBinding[] {
        return computeConfig() ? this.profiles.map((profile) => this.binding(profile)) : []
    }

    async getBindingHealth(input: { definition: SandboxRuntimeDefinition; binding: SandboxRuntimeBinding }) {
        try {
            this.assertDefinition(input.definition, input.binding)
            return {
                available: true,
                manifest: await this.client(this.profile(input.definition.name)).health(input.definition)
            }
        } catch {
            return { available: false, reason: this.unavailable().message }
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
            throw this.invalidPolicy()
        const profile = this.profile(definition.name)
        const id = this.runtimeId(profile, options.tenantId, options.workFor.id)
        const client = this.client(profile)
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
                if (!isDeepStrictEqual([...argv], trusted)) throw this.invalidPolicy()
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
                    throw this.invalidPolicy()
                return client.execute(id, timeoutMs, maxOutputBytes, execution.onOutput)
            },
            uploadFiles: (files) => client.upload(id, files),
            downloadFiles: (paths) => client.download(id, paths),
            terminate: () => client.terminate(id)
        }
    }

    async destroy(options: SandboxRuntimeDestroyOptions): Promise<void> {
        const profile = this.profile(options.runtimeProfile)
        const binding = this.binding(profile)
        const id = this.runtimeId(profile, options.tenantId, options.workFor.id)
        if (
            options.workFor.type !== 'job' ||
            options.runtimeProfile !== binding.runtimeProfile ||
            options.runtimeBindingId !== binding.id ||
            !isDeepStrictEqual(options.artifact, binding.artifact) ||
            (options.runtimeRef && options.runtimeRef !== id)
        )
            throw this.invalidPolicy()
        await this.client(profile).destroy(id)
    }

    private binding(profile: NsjailJobProfile): SandboxRuntimeBinding {
        const definition = this.definitions.require(profile.name)
        const hash =
            profile.digest === 'runner'
                ? definition.expectedManifest.runnerHostSha256
                : createHash('sha256').update(JSON.stringify(definition.expectedManifest)).digest('hex')
        const digest = `sha256:${hash}`
        return {
            id: profile.bindingId,
            provider: this.type,
            providerVersion: this.version,
            runtimeProfile: definition.name,
            priority: 100,
            artifact: {
                kind: 'remote-runtime',
                reference: `nsjail://${definition.name}/${definition.sandboxRuntimeVersion}@${digest}`,
                digest
            }
        }
    }

    private assertDefinition(definition: SandboxRuntimeDefinition, binding: SandboxRuntimeBinding): void {
        if (
            !isDeepStrictEqual(definition, this.definitions.require(this.profile(definition.name).name)) ||
            !isDeepStrictEqual(binding, this.binding(this.profile(definition.name)))
        )
            throw this.invalidPolicy()
    }

    private runtimeId(profile: NsjailJobProfile, tenantId: string, jobId: string): string {
        if (!tenantId || !jobId || tenantId.length > 256 || jobId.length > 256) throw this.invalidPolicy()
        return createHash('sha256')
            .update(JSON.stringify([this.binding(profile).artifact.reference, tenantId, jobId]))
            .digest('hex')
    }

    private profile(name: string): NsjailJobProfile {
        const profile = this.profiles.find((profile) => profile.name === name)
        if (!profile) throw this.invalidPolicy()
        return profile
    }

    private client(profile: NsjailJobProfile): NsjailComputeClient {
        const config = computeConfig()
        if (!config) throw this.unavailable()
        return new NsjailComputeClient(config, {
            root: profile.route,
            healthTimeoutMs: profile.healthTimeoutMs,
            unavailable: this.unavailable
        })
    }
}
