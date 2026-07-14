import { Injectable } from '@nestjs/common'
import {
    SandboxJobRuntimeError,
    SandboxRuntimeProviderRegistry,
    type ISandboxRuntimeProvider,
    type SandboxRuntimeBinding,
    type SandboxRuntimeDefinition
} from '@xpert-ai/plugin-sdk'

/** Healthy Provider/Binding pair selected for one Runtime Definition. */
export type SandboxRuntimeResolution = {
    provider: ISandboxRuntimeProvider
    binding: SandboxRuntimeBinding
    manifest?: Record<string, string>
}

/** Aggregated result of compatibility filtering and Provider health probing. */
export type SandboxRuntimeSelectionHealth = {
    available: boolean
    reason?: 'RUNTIME_UNBOUND' | 'PROVIDER_UNAVAILABLE' | 'PROFILE_UNHEALTHY'
    message?: string
    resolution?: SandboxRuntimeResolution
}

/** Deterministically selects the first healthy Binding that satisfies a Definition's guarantees. */
@Injectable()
export class SandboxRuntimeBindingSelector {
    constructor(private readonly providers: SandboxRuntimeProviderRegistry) {}

    /** Inspects all eligible Providers without creating a Job Runtime. */
    async inspect(definition: SandboxRuntimeDefinition): Promise<SandboxRuntimeSelectionHealth> {
        const providers = this.providers.list()
        if (!providers.length) {
            return {
                available: false,
                reason: 'RUNTIME_UNBOUND',
                message: `No Sandbox Runtime Provider binds ${definition.name}.`
            }
        }

        const candidates: Array<{ provider: ISandboxRuntimeProvider; binding: SandboxRuntimeBinding }> = []
        const providerErrors: string[] = []
        for (const provider of providers) {
            if (!satisfiesRequirements(provider, definition)) continue
            try {
                const bindings = await provider.listBindings()
                for (const binding of bindings) {
                    if (
                        binding.runtimeProfile === definition.name &&
                        binding.provider === provider.type &&
                        isArtifactAllowed(binding)
                    ) {
                        candidates.push({ provider, binding })
                    }
                }
            } catch (error) {
                providerErrors.push(`${provider.type}: ${messageOf(error)}`)
            }
        }

        candidates.sort(
            (left, right) =>
                left.binding.priority - right.binding.priority ||
                left.provider.type.localeCompare(right.provider.type) ||
                left.binding.id.localeCompare(right.binding.id)
        )
        if (!candidates.length) {
            return {
                available: false,
                reason: providerErrors.length ? 'PROVIDER_UNAVAILABLE' : 'RUNTIME_UNBOUND',
                message: providerErrors.length
                    ? providerErrors.join(' ')
                    : `No compatible Sandbox Runtime Binding is installed for ${definition.name}.`
            }
        }

        const healthFailures: string[] = []
        for (const candidate of candidates) {
            try {
                const health = await candidate.provider.getBindingHealth({
                    definition,
                    binding: candidate.binding
                })
                if (health.available) {
                    return {
                        available: true,
                        resolution: {
                            ...candidate,
                            ...(health.manifest ? { manifest: health.manifest } : {})
                        }
                    }
                }
                healthFailures.push(
                    `${candidate.provider.type}/${candidate.binding.id}: ${health.reason ?? 'unhealthy'}`
                )
            } catch (error) {
                healthFailures.push(`${candidate.provider.type}/${candidate.binding.id}: ${messageOf(error)}`)
            }
        }

        return {
            available: false,
            reason: 'PROFILE_UNHEALTHY',
            message: healthFailures.join(' ')
        }
    }

    /** Resolves a healthy Binding or converts selection failure into the stable Job error contract. */
    async require(definition: SandboxRuntimeDefinition, jobId?: string): Promise<SandboxRuntimeResolution> {
        const health = await this.inspect(definition)
        if (health.resolution) return health.resolution
        if (health.reason === 'RUNTIME_UNBOUND') {
            throw new SandboxJobRuntimeError(
                'SANDBOX_RUNTIME_UNAVAILABLE',
                health.message ?? `Sandbox Runtime ${definition.name} has no compatible Provider Binding.`,
                false,
                jobId
            )
        }
        throw new SandboxJobRuntimeError(
            'SANDBOX_START_FAILED',
            health.message ?? `Sandbox Runtime ${definition.name} is temporarily unavailable.`,
            true,
            jobId
        )
    }
}

function satisfiesRequirements(provider: ISandboxRuntimeProvider, definition: SandboxRuntimeDefinition): boolean {
    const available = provider.capabilities
    const required = definition.requirements
    if (required.isolation === 'hardened' && available.isolation !== 'hardened') return false
    return (
        (!required.ephemeral || available.ephemeral) &&
        (!required.resourceLimits || available.resourceLimits) &&
        (!required.networkPolicy || available.networkPolicy) &&
        (!required.readOnlyRootFilesystem || available.readOnlyRootFilesystem)
    )
}

function isArtifactAllowed(binding: SandboxRuntimeBinding): boolean {
    if (binding.artifact.kind !== 'oci-image' || process.env.NODE_ENV !== 'production') return true
    const match = binding.artifact.reference.match(/@sha256:([a-f0-9]{64})$/i)
    if (!match) return false
    return !binding.artifact.digest || binding.artifact.digest.toLowerCase() === `sha256:${match[1].toLowerCase()}`
}

function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}
