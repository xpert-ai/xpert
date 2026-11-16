import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { ForbiddenException } from '@nestjs/common'
import type { ResourceAnalysisDataset, ResourceAnalysisPolicy } from '@xpert-ai/contracts'
import { AnalyticsRuntimeService } from '@xpert-ai/server-core'
import { resolveArtifactAnalytics } from '../../artifact-analytics'
import { t } from 'i18next'
import { ArtifactsService } from '../../../artifacts.service'
import { ArtifactTypesService } from '../../../types/artifact-types.service'
import { ArtifactContentAccess } from '../../../artifact-content-access'
import { isResourceAnalysisFilterValue, resolveAnalyticsParameters } from '@xpert-ai/plugin-sdk/analytics'

import { ResourceAnalysisAuthoringCommand } from '../resource-analysis-authoring.command'

@CommandHandler(ResourceAnalysisAuthoringCommand)
export class ResourceAnalysisAuthoringHandler implements ICommandHandler<ResourceAnalysisAuthoringCommand> {
    constructor(
        private readonly artifacts: ArtifactsService,
        private readonly analytics: AnalyticsRuntimeService,
        private readonly types: ArtifactTypesService,
        private readonly access: ArtifactContentAccess
    ) {}
    async execute({ actor, artifactId, versionId, policy }: ResourceAnalysisAuthoringCommand) {
        const resolved = await this.artifacts.resolveForManagementAccess({ artifactId, artifactVersionId: versionId })
        await this.access.assert(resolved.artifact, actor, 'manage')
        const context = { actor, artifact: resolved.artifact, version: resolved.version, content: resolved.buffer }
        const resolvedAnalytics = await resolveArtifactAnalytics(this.types, context)
        const datasets = resolvedAnalytics.datasets
        if (!policy) {
            for (const dataset of datasets) {
                try {
                    await this.analytics.authorizeGroupSharing(
                        actor,
                        resolvedAnalytics.entries.find((entry) => entry.binding.id === dataset.key).binding
                    )
                    dataset.canShare = true
                } catch {
                    dataset.canShare = false
                }
            }
        }
        if (policy) {
            for (const item of policy.datasets) {
                const dataset = datasets.find((dataset) => dataset.key === item.key)
                if (
                    !dataset ||
                    item.fields.some((field) => !dataset.fields.some((candidate) => candidate.id === field)) ||
                    item.filters.some((filter) => !item.fields.includes(filter.field))
                )
                    throw new ForbiddenException(t('server-ai:Error.ResourceAnalysisDenied'))
                if (
                    item.filters.some((filter) =>
                        filter.values.some(
                            (value) =>
                                !isResourceAnalysisFilterValue(
                                    dataset.fields.find((field) => field.id === filter.field).logicalType,
                                    value
                                )
                        )
                    )
                )
                    throw new ForbiddenException(t('server-ai:Error.ResourceAnalysisInvalid'))
            }
            for (const item of policy.datasets) {
                const entry = resolvedAnalytics.entries.find((entry) => entry.binding.id === item.key)
                if (policy.execution === 'delegated_results') {
                    const allowed = new Set(entry.binding.parameters.map((parameter) => parameter.controlId))
                    const defaults = await resolvedAnalytics.normalizeControls(item.key, {})
                    const base = { ...defaults }
                    for (const [control, values] of Object.entries(item.controlValues ?? {})) {
                        if (!allowed.has(control))
                            throw new ForbiddenException(t('server-ai:Error.ResourceAnalysisInvalid'))
                        base[control] = values[0]
                    }
                    // Validate every accepted value against the immutable binding contract before issuing consent.
                    resolveAnalyticsParameters(entry.binding, base)
                    for (const [control, values] of Object.entries(item.controlValues ?? {}))
                        for (const value of values)
                            resolveAnalyticsParameters(
                                entry.binding,
                                await resolvedAnalytics.normalizeControls(item.key, { ...base, [control]: value })
                            )
                }
                await this.analytics.authorizeGroupSharing(
                    actor,
                    resolvedAnalytics.entries.find((entry) => entry.binding.id === item.key).binding
                )
            }
        }
        await this.access.assert(resolved.artifact, actor, 'manage')
        resolvedAnalytics.recheck()
        return datasets
    }
}
