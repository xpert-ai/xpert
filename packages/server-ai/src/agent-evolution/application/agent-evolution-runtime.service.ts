import { createHash, randomUUID } from 'crypto'
import type {
    CapabilityExecutionAssignment,
    CapabilityExecutionPlan,
    CapabilityVersionBundle,
    EvolutionRuntimeApi,
    EvolutionRuntimeObservation,
    LearningEvent,
    ResolveCapabilityExecutionPlanRequest
} from '@xpert-ai/contracts'
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { hashEvolutionValue } from '../domain/evolution-hash'
import { AgentEvolutionStore, EvolutionTenantScope } from './agent-evolution.store'

@Injectable()
export class AgentEvolutionRuntimeService implements EvolutionRuntimeApi {
    constructor(private readonly store: AgentEvolutionStore) {}

    async ingestLearningEvent(input: Parameters<EvolutionRuntimeApi['ingestLearningEvent']>[0]) {
        const tenant = toTenantScope(input)
        validateScope(tenant, input.event.scope)
        if (input.event.classification === 'confidential' && input.event.redactionStatus !== 'redacted') {
            throw new BadRequestException('Confidential learning events must be redacted before ingestion')
        }
        const target = await this.store.findTarget(tenant, input.event.targetId)
        if (!target || target.status !== 'active') {
            throw new NotFoundException(`Active evolution target '${input.event.targetId}' was not found`)
        }
        const now = new Date().toISOString()
        const event: LearningEvent = {
            ...input.event,
            eventId: input.event.eventId ?? `EVT-${randomUUID()}`,
            reviewStatus: 'pending',
            createdAt: now
        }
        return (await this.store.saveLearningEvent(tenant, event)).value
    }

    async resolveExecutionPlan(request: ResolveCapabilityExecutionPlanRequest): Promise<CapabilityExecutionPlan> {
        const tenant = toTenantScope(request)
        validateScope(tenant, request.scope)
        if (!request.targetIds.length) throw new BadRequestException('At least one targetId is required')
        if (!request.subjectKey.trim()) throw new BadRequestException('subjectKey is required')

        const productionAssignments: CapabilityExecutionAssignment[] = []
        const shadowAssignments: CapabilityExecutionAssignment[] = []
        let canarySelected = false

        for (const targetId of [...new Set(request.targetIds)]) {
            const pointer = await this.store.findPointer(tenant, targetId, request.scope, 'production')
            if (!pointer) {
                throw new NotFoundException(`Production pointer for '${targetId}' was not found`)
            }
            let productionVersionId = pointer.activeVersionId
            const deployments = await this.store.listDeploymentsForTarget(tenant, targetId)
            for (const deploymentEntity of deployments) {
                const deployment = deploymentEntity.value
                const releaseEntity = await this.store.findRelease(tenant, deployment.releasePackageId)
                const release = releaseEntity?.value
                if (!release || release.status === 'paused' || release.status === 'rolled_back') continue
                if (deployment.channel === 'shadow' && release.status === 'shadow') {
                    shadowAssignments.push({
                        targetId,
                        channel: 'shadow',
                        versionId: release.targetVersionId,
                        deploymentId: deployment.deploymentId
                    })
                    break
                }
                if (
                    deployment.channel === 'canary' &&
                    release.status === 'canary' &&
                    deterministicPercent(deployment.deploymentId, request.subjectKey) < deployment.canaryPercent
                ) {
                    productionVersionId = release.targetVersionId
                    canarySelected = true
                    productionAssignments.push({
                        targetId,
                        channel: 'canary',
                        versionId: productionVersionId,
                        deploymentId: deployment.deploymentId
                    })
                    break
                }
            }
            if (!productionAssignments.some((item) => item.targetId === targetId)) {
                let deploymentId: string | undefined
                if (pointer.value.releasePackageId) {
                    const productionDeployment = (
                        await this.store.listDeploymentsForRelease(tenant, pointer.value.releasePackageId)
                    ).find((item) => item.channel === 'production' && item.status === 'active')
                    deploymentId = productionDeployment?.deploymentId
                }
                productionAssignments.push({
                    targetId,
                    channel: 'production',
                    versionId: productionVersionId,
                    ...(deploymentId ? { deploymentId } : {})
                })
            }
        }

        const resolvedAt = new Date().toISOString()
        const bundle = await this.createBundle(
            tenant,
            productionAssignments,
            canarySelected ? 'canary' : shadowAssignments.length ? 'shadow' : 'production',
            resolvedAt
        )
        const shadowBundle = shadowAssignments.length
            ? await this.createBundle(tenant, shadowAssignments, 'shadow', resolvedAt)
            : undefined
        return {
            executionId: request.executionId,
            executionMode: bundle.executionMode,
            subjectKey: request.subjectKey,
            bundle,
            assignments: productionAssignments,
            ...(shadowBundle ? { shadowBundle, shadowAssignments } : {}),
            resolvedAt
        }
    }

    async getCapabilityBundle(input: Parameters<EvolutionRuntimeApi['getCapabilityBundle']>[0]) {
        const entity = await this.store.findBundle(toTenantScope(input), input.bundleId)
        if (!entity) throw new NotFoundException(`Capability bundle '${input.bundleId}' was not found`)
        return entity.value
    }

    async getCapabilityVersion(input: Parameters<EvolutionRuntimeApi['getCapabilityVersion']>[0]) {
        const entity = await this.store.findVersion(toTenantScope(input), input.versionId)
        if (!entity) throw new NotFoundException(`Capability version '${input.versionId}' was not found`)
        return entity.value
    }

    async recordRuntimeObservation(input: Parameters<EvolutionRuntimeApi['recordRuntimeObservation']>[0]) {
        const tenant = toTenantScope(input)
        validateScope(tenant, input.observation.scope)
        const observation: EvolutionRuntimeObservation = {
            ...input.observation,
            observationId: input.observation.observationId ?? `OBS-${randomUUID()}`,
            createdAt: new Date().toISOString()
        }
        return this.store.saveRuntimeObservation(tenant, observation)
    }

    private async createBundle(
        tenant: EvolutionTenantScope,
        assignments: CapabilityExecutionAssignment[],
        executionMode: CapabilityVersionBundle['executionMode'],
        createdAt: string
    ) {
        const items = []
        for (const assignment of assignments) {
            const version = await this.store.findVersion(tenant, assignment.versionId)
            if (!version) throw new NotFoundException(`Capability version '${assignment.versionId}' was not found`)
            items.push({
                targetId: assignment.targetId,
                versionId: assignment.versionId,
                artifactHash: version.value.artifact.hash,
                providerKey: version.value.providerKey,
                providerVersion: version.value.providerVersion
            })
        }
        const bundleHash = hashEvolutionValue(items)
        const bundle: CapabilityVersionBundle = {
            bundleId: `BND-${randomUUID()}`,
            bundleHash,
            executionMode,
            items,
            createdAt
        }
        await this.store.saveBundle(tenant, bundle)
        return bundle
    }
}

function deterministicPercent(deploymentId: string, subjectKey: string) {
    const value = createHash('sha256').update(`${deploymentId}:${subjectKey}`).digest().readUInt32BE(0)
    return (value / 0x1_0000_0000) * 100
}

function validateScope(tenant: EvolutionTenantScope, scope: { type: string; key: string }) {
    if (!scope.key.trim()) throw new BadRequestException('Evolution scope key is required')
    if (scope.type === 'organization' && tenant.organizationId && scope.key !== tenant.organizationId) {
        throw new BadRequestException('Evolution organization scope does not match the request organization')
    }
}

function toTenantScope(input: { tenantId: string; organizationId?: string | null }): EvolutionTenantScope {
    return { tenantId: input.tenantId, organizationId: input.organizationId ?? null }
}
