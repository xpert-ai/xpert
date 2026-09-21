// Baselines capture published source rules. They must never replace a governed
// candidate release, and publication must compare the reviewed source and pointer.
import { randomUUID } from 'node:crypto'
import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { t } from 'i18next'
import { AIPermissionsEnum } from '@xpert-ai/contracts'
import type {
    ActiveCapabilityPointer,
    CapabilityVersion,
    EvolutionBaselineIdentity,
    EvolutionBaselineInspection,
    EvolutionBaselinePublishRequest,
    EvolutionBaselineRuntimeApi,
    ExportEvolutionBaselineRequest
} from '@xpert-ai/contracts'
import { EvolutionBaselineRuntimeCapability, EvolutionTargetProviderRegistry } from '@xpert-ai/plugin-sdk'
import { RequestContext } from '@xpert-ai/server-core'
import { RuntimeCapabilityProvider } from '../../shared/runtime'
import {
    ActiveCapabilityPointerEntity,
    CapabilityVersionEntity,
    EvolutionAuditEventEntity,
    EvolutionTargetEntity
} from '../entities'
import { AgentEvolutionStore } from './agent-evolution.store'

@Injectable()
@RuntimeCapabilityProvider(EvolutionBaselineRuntimeCapability)
export class EvolutionBaselineService implements EvolutionBaselineRuntimeApi {
    constructor(
        private readonly store: AgentEvolutionStore,
        private readonly providers: EvolutionTargetProviderRegistry,
        @InjectDataSource() private readonly dataSource: DataSource
    ) {}

    async inspect(input: EvolutionBaselineIdentity): Promise<EvolutionBaselineInspection> {
        this.authorize(input, false)
        const provider = this.providers.get(input.targetId, input.organizationId)
        const exporter = provider.baselineExporter
        if (!exporter?.previewBaseline) throw new BadRequestException(baselineError('unsupported'))
        const request = this.request(input)
        const preview = await exporter.previewBaseline(request)
        const pointer = await this.store.findPointer(input, input.targetId, request.scope)
        const version = pointer ? await this.store.findVersion(input, pointer.activeVersionId) : null
        if (pointer && !version) throw new ConflictException(baselineError('version_missing'))
        const current =
            pointer && version
                ? {
                      pointer: pointer.value,
                      version: version.value,
                      contentJson: exporter.readBaseline
                          ? await exporter.readBaseline(request, version.value.artifact)
                          : null
                  }
                : null
        return {
            targetId: input.targetId,
            canManage: RequestContext.hasPermission(AIPermissionsEnum.EVOLUTION_MANAGE),
            status:
                current?.pointer.releasePackageId || current?.version.sourceCandidateId
                    ? 'managed_release'
                    : !preview.ready
                      ? 'blocked'
                      : !current
                        ? 'missing'
                        : current.version.artifact.hash === preview.hash
                          ? 'current'
                          : 'update_available',
            preview,
            current
        }
    }

    async publish(input: EvolutionBaselinePublishRequest): Promise<ActiveCapabilityPointer> {
        this.authorize(input, true)
        if (
            !['initialize', 'update'].includes(input.mode) ||
            !Number.isSafeInteger(input.expectedRevision) ||
            input.expectedRevision < 0 ||
            !/^[a-f0-9]{64}$/.test(input.expectedHash) ||
            typeof input.reason !== 'string' ||
            input.reason.trim().length < 3 ||
            input.reason.length > 1000
        ) {
            throw new BadRequestException(baselineError('invalid_request'))
        }
        const inspected = await this.inspect(input)
        if (!inspected.preview.ready) throw new ConflictException(baselineError('source_not_ready'))
        if (inspected.preview.hash !== input.expectedHash) throw new ConflictException(baselineError('source_changed'))
        if (inspected.status === 'managed_release') throw new ConflictException(baselineError('managed_release'))
        const provider = this.providers.get(input.targetId, input.organizationId)
        const request = this.request(input)
        return this.dataSource.transaction(async (manager) => {
            // Also serializes initialization, where there is no pointer row to lock yet.
            await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
                JSON.stringify([input.tenantId, input.organizationId, input.targetId, 'baseline'])
            ])
            const scope = { tenantId: input.tenantId, organizationId: input.organizationId }
            const pointers = manager.getRepository(ActiveCapabilityPointerEntity)
            const versions = manager.getRepository(CapabilityVersionEntity)
            const current = await pointers.findOne({
                where: {
                    ...scope,
                    targetId: input.targetId,
                    scopeType: 'organization',
                    scopeKey: input.organizationId,
                    channel: 'production'
                },
                lock: { mode: 'pessimistic_write' }
            })
            const currentVersion = current
                ? await versions.findOneBy({ ...scope, versionId: current.activeVersionId })
                : null
            if (current && !currentVersion) throw new ConflictException(baselineError('version_missing'))
            if (current?.value.releasePackageId || currentVersion?.value.sourceCandidateId) {
                throw new ConflictException(baselineError('managed_release'))
            }
            // An exact replay after success is harmless; never overwrite a different version on retry.
            if (current && currentVersion?.artifactHash === input.expectedHash) return current.value
            if (
                (current?.revision ?? 0) !== input.expectedRevision ||
                (input.mode === 'initialize' && current) ||
                (input.mode === 'update' && !current)
            ) {
                throw new ConflictException(baselineError('revision_changed'))
            }
            const exported = await provider.baselineExporter!.exportBaseline(request)
            if (exported.artifact.hash !== input.expectedHash)
                throw new ConflictException(baselineError('source_changed'))
            const latest = await versions.findOne({
                where: { ...scope, targetId: input.targetId },
                order: { sequence: 'DESC' }
            })
            const sequence = (latest?.sequence ?? 0) + 1
            const now = new Date().toISOString()
            const actorId = RequestContext.currentUserId()
            const version: CapabilityVersion = {
                versionId: `${input.targetId}:baseline:${randomUUID()}`,
                targetId: input.targetId,
                sequence,
                semanticVersion: exported.semanticVersion,
                artifact: exported.artifact,
                providerKey: provider.descriptor.providerKey,
                providerVersion: provider.descriptor.providerVersion,
                dependencyVersionIds: exported.dependencyVersionIds,
                createdAt: now,
                createdBy: actorId
            }
            await versions.save(
                versions.create({
                    ...scope,
                    targetId: input.targetId,
                    versionId: version.versionId,
                    sequence,
                    artifactHash: version.artifact.hash,
                    value: version
                })
            )
            const pointer: ActiveCapabilityPointer = {
                pointerId: current?.pointerId ?? `PTR-${randomUUID()}`,
                targetId: input.targetId,
                scope: request.scope,
                channel: 'production',
                activeVersionId: version.versionId,
                ...(current ? { rollbackVersionId: current.activeVersionId } : {}),
                revision: (current?.revision ?? 0) + 1,
                updatedAt: now,
                updatedBy: actorId
            }
            await pointers.save(
                pointers.create({
                    ...current,
                    ...scope,
                    targetId: input.targetId,
                    pointerId: pointer.pointerId,
                    scopeType: 'organization',
                    scopeKey: input.organizationId,
                    channel: 'production',
                    activeVersionId: version.versionId,
                    revision: pointer.revision,
                    value: pointer
                })
            )
            const audit = manager.getRepository(EvolutionAuditEventEntity)
            const auditId = randomUUID()
            await audit.save(
                audit.create({
                    ...scope,
                    auditId,
                    action: `baseline_${input.mode}`,
                    value: {
                        auditId,
                        action: `baseline_${input.mode}`,
                        actorId,
                        actorRole: RequestContext.currentRoleId() ?? '',
                        summary: `${input.targetId}: ${current?.activeVersionId ?? 'none'} -> ${version.versionId}`,
                        metadata: { reason: input.reason.trim() },
                        occurredAt: now
                    }
                })
            )
            await manager.getRepository(EvolutionTargetEntity).upsert(
                {
                    ...scope,
                    targetId: input.targetId,
                    providerKey: provider.descriptor.providerKey,
                    status: provider.descriptor.status,
                    descriptor: provider.descriptor
                },
                ['tenantId', 'organizationId', 'targetId']
            )
            return pointer
        })
    }

    private authorize(input: EvolutionBaselineIdentity, write: boolean) {
        if (
            !input.tenantId ||
            !input.organizationId ||
            input.tenantId !== RequestContext.currentTenantId() ||
            input.organizationId !== RequestContext.getOrganizationId() ||
            !RequestContext.currentUserId()
        ) {
            throw new ForbiddenException(baselineError('scope_denied'))
        }
        const manage = RequestContext.hasPermission(AIPermissionsEnum.EVOLUTION_MANAGE)
        if (
            write
                ? !manage
                : !manage &&
                  !RequestContext.hasPermission(AIPermissionsEnum.EVOLUTION_VIEW) &&
                  !RequestContext.hasPermission(AIPermissionsEnum.XPERT_EDIT)
        ) {
            throw new ForbiddenException(baselineError('permission_denied'))
        }
    }

    private request(input: EvolutionBaselineIdentity): ExportEvolutionBaselineRequest {
        const scope = { type: 'organization' as const, key: input.organizationId }
        return {
            targetId: input.targetId,
            scope,
            context: {
                ...input,
                scope,
                correlationId: `baseline:${randomUUID()}`,
                actor: {
                    actorId: RequestContext.currentUserId(),
                    actorType: 'human',
                    actorRole: RequestContext.currentRoleId()
                }
            }
        }
    }
}

function baselineError(code: string) {
    return {
        code: `evolution_baseline_${code}`,
        message: t('server-ai:Error.EvolutionBaselineOperationFailed', {
            defaultValue:
                'Rule baseline operation could not be completed. Refresh the rule status and check permissions.'
        })
    }
}
