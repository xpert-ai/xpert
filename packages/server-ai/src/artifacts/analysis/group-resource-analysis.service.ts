// Analysis resolves the pinned type registration, independently of renderer availability.
// Shared content loading and post-operation checks prevent revoked or replaced resources from releasing results.
import { ForbiddenException, Injectable } from '@nestjs/common'
import type { ResourceAnalysisDescription, ResourceAnalysisQuery, ResourceAnalysisResult } from '@xpert-ai/contracts'
import type { ContentActor } from '@xpert-ai/plugin-sdk'
import { resourceAnalysisPolicySchema } from '@xpert-ai/plugin-sdk/analytics'
import { AnalyticsRuntimeService } from '@xpert-ai/server-core'
import { t } from 'i18next'
import { ArtifactGroupContentService } from '../group-references/artifact-group-content.service'
import { ArtifactTypesService } from '../types/artifact-types.service'
import { resolveArtifactAnalytics } from './artifact-analytics'
import { analyzeDataset, projectAnalysisDataset, validateAnalysisQuery } from './resource-analysis.query'

@Injectable()
export class GroupResourceAnalysisService {
    constructor(
        private readonly contents: ArtifactGroupContentService,
        private readonly types: ArtifactTypesService,
        private readonly analytics: AnalyticsRuntimeService
    ) {}

    private async load(actor: ContentActor, groupId: string, referenceId: string) {
        const loaded = await this.contents.load(actor, groupId, referenceId)
        const parsed = resourceAnalysisPolicySchema.safeParse(loaded.selected.grant.analysis)
        if (!parsed.success) throw denied()
        const resolved = await resolveArtifactAnalytics(this.types, loaded.context)
        const recheck = async () => {
            await loaded.recheck()
            resolved.recheck()
        }
        await recheck()
        return { ...loaded, resolved, policy: parsed.data, recheck }
    }

    /** Host-only resolution; query callers cannot replace a published source or native payload. */
    async resolveAnalysisBinding(actor: ContentActor, groupId: string, referenceId: string, datasetKey: string) {
        const loaded = await this.load(actor, groupId, referenceId)
        const scope = loaded.policy.datasets.find((dataset) => dataset.key === datasetKey)
        const entry = loaded.resolved.entries.find((entry) => entry.binding.id === datasetKey)
        if (!scope || !entry) throw denied()
        return {
            binding: entry.binding,
            approvedById: loaded.selected.grant.issuedById,
            revalidate: loaded.recheck,
            normalizeControls: (controls: import('@xpert-ai/contracts').AnalyticsQueryRequest['controls']) =>
                loaded.resolved.normalizeControls(datasetKey, controls),
            project: (dataset: import('@xpert-ai/contracts').AnalyticalDataset) =>
                projectAnalysisDataset(dataset, scope)
        }
    }

    async describeAnalysis(
        actor: ContentActor,
        groupId: string,
        referenceId: string
    ): Promise<ResourceAnalysisDescription> {
        const loaded = await this.load(actor, groupId, referenceId)
        const datasets = loaded.resolved.datasets.flatMap((dataset) => {
            const scope = loaded.policy.datasets.find((item) => item.key === dataset.key)
            return scope
                ? [
                      {
                          ...dataset,
                          fields: dataset.fields.filter((field) => scope.fields.includes(field.id)),
                          parameters: dataset.parameters.map(({ name, controlId, type, required }) => ({
                              name,
                              controlId,
                              type,
                              required
                          }))
                      }
                  ]
                : []
        })
        await loaded.recheck()
        return {
            referenceId,
            title: loaded.selected.reference.title,
            versionNumber: loaded.context.version.versionNumber,
            policy: loaded.policy,
            datasets
        }
    }

    async queryAnalysis(
        actor: ContentActor,
        groupId: string,
        referenceId: string,
        input: ResourceAnalysisQuery
    ): Promise<ResourceAnalysisResult> {
        const loaded = await this.load(actor, groupId, referenceId)
        const descriptor = loaded.resolved.datasets.find((dataset) => dataset.key === input.datasetKey)
        if (!descriptor || !loaded.policy.datasets.some((item) => item.key === input.datasetKey)) throw denied()
        validateAnalysisQuery(descriptor.fields, loaded.policy, input)
        await loaded.recheck()
        let result: Awaited<ReturnType<AnalyticsRuntimeService['queryGroupReference']>>
        try {
            result = await this.analytics.queryGroupReference(
                actor,
                { groupId, referenceId, datasetKey: input.datasetKey },
                input.controls
            )
        } catch {
            // Native diagnostics can disclose undelegated tables, fields or connection information.
            throw new ForbiddenException(t('server-ai:Error.ResourceAnalysisSourceDenied'))
        }
        const dataset = analyzeDataset(result, loaded.policy, input)
        await loaded.recheck()
        const response: ResourceAnalysisResult = {
            dataset,
            evidence: {
                referenceId,
                artifactId: loaded.context.artifact.id,
                versionId: loaded.context.version.id,
                groupId,
                datasetKey: input.datasetKey,
                queriedAt: dataset.freshness.executedAt,
                controls: input.controls,
                filters: [
                    ...loaded.policy.datasets.find((item) => item.key === input.datasetKey).filters,
                    ...input.filters
                ]
            }
        }
        if (Buffer.byteLength(JSON.stringify(response)) > 64000)
            throw new ForbiddenException(t('server-ai:Error.ResourceAnalysisBudget'))
        return response
    }
}
const denied = () => new ForbiddenException(t('server-ai:Error.ResourceAnalysisDenied'))
