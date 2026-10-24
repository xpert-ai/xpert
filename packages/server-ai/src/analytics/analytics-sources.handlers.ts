import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import {
    AnalyticsProviderRegistry,
    ListAnalyticsSourcesCommand,
    ResolveAnalyticsSourceCommand,
    type DataSourceActor,
    type AnalyticsResolvedSource
} from '@xpert-ai/plugin-sdk'
import type { AnalyticsSourceSummary, AnalyticsVersionedSourceRef } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { ArtifactsService } from '../artifacts/artifacts.service'
import { AnalyticsDefinitionService } from './analytics-definition.service'
import { definitionError } from './analytics-definition.errors'

@Injectable()
export class AnalyticsArtifactSources {
    constructor(
        private readonly artifacts: ArtifactsService,
        private readonly definitions: AnalyticsDefinitionService,
        private readonly providers: AnalyticsProviderRegistry
    ) {}
    async list(actor: DataSourceActor) {
        await this.definitions.authorize(actor)
        const result: AnalyticsSourceSummary[] = []
        for (const provider of this.providers.list(actor.organizationId)) {
            const config = provider.configuration
            if (config?.kind !== 'artifact' || !provider.descriptor.sourceKinds.includes('artifact')) continue
            let page = 1
            for (;;) {
                const records = await this.artifacts.listArtifacts({
                    pluginName: config.pluginName,
                    resourceType: config.resourceType,
                    status: 'active',
                    page,
                    pageSize: 100
                })
                for (const item of records.items)
                    if (item.currentVersionId)
                        result.push({
                            source: { kind: 'artifact', artifactId: item.id, versionId: item.currentVersionId },
                            name: item.title ?? provider.descriptor.name,
                            providers: [provider.descriptor]
                        })
                if (page++ * records.pageSize >= records.total) break
            }
        }
        return result
    }
    async resolve(
        actor: DataSourceActor,
        source: Extract<AnalyticsVersionedSourceRef, { kind: 'artifact' }>
    ): Promise<AnalyticsResolvedSource> {
        await this.definitions.authorize(actor)
        const load = async () => {
            await this.definitions.authorize(actor)
            const resolved = await this.artifacts.resolveForManagementAccess({
                artifactId: source.artifactId,
                artifactVersionId: source.versionId
            })
            const providers = this.providers
                .list(actor.organizationId)
                .filter(
                    (provider) =>
                        provider.configuration?.kind === 'artifact' &&
                        provider.descriptor.sourceKinds.includes('artifact') &&
                        provider.configuration.pluginName === resolved.artifact.pluginName &&
                        provider.configuration.resourceType === resolved.artifact.resourceType
                )
            if (providers.length !== 1 || resolved.version.status !== 'active' || !resolved.version.sha256)
                throw definitionError('unavailable')
            return { resolved, provider: providers[0] }
        }
        const initial = await load()
        // Artifact providers own their document schema; the host authorizes identity and immutable bytes.
        return {
            source,
            providerIds: [initial.provider.descriptor.id],
            options: {},
            revalidate: async () => {
                const current = await load()
                if (
                    current.resolved.version.sha256 !== initial.resolved.version.sha256 ||
                    current.provider !== initial.provider
                )
                    throw definitionError('unavailable')
            }
        }
    }
}
@CommandHandler(ListAnalyticsSourcesCommand)
export class ListAnalyticsSourcesHandler implements ICommandHandler<ListAnalyticsSourcesCommand> {
    constructor(
        private readonly definitions: AnalyticsDefinitionService,
        private readonly artifacts: AnalyticsArtifactSources,
        private readonly providers: AnalyticsProviderRegistry
    ) {}
    async execute({ actor, kind }: ListAnalyticsSourcesCommand): Promise<AnalyticsSourceSummary[]> {
        if (kind === 'artifact') return this.artifacts.list(actor)
        if (kind !== 'definition') throw definitionError('invalid')
        const result: AnalyticsSourceSummary[] = []
        let page = 1
        for (;;) {
            const records = await this.definitions.list(page, 100, actor)
            for (const item of records.items) {
                const provider = this.providers
                    .list(actor.organizationId)
                    .find(
                        (provider) =>
                            provider.descriptor.id === item.providerId &&
                            provider.descriptor.sourceKinds.includes('definition')
                    )
                if (item.status === 'active' && item.currentVersionId && provider)
                    result.push({
                        source: { kind, definitionId: item.id, versionId: item.currentVersionId },
                        name: item.name,
                        providers: [provider.descriptor]
                    })
            }
            if (page++ * records.pageSize >= records.total) break
        }
        return result
    }
}
@CommandHandler(ResolveAnalyticsSourceCommand)
export class ResolveAnalyticsSourceHandler implements ICommandHandler<ResolveAnalyticsSourceCommand> {
    constructor(
        private readonly definitions: AnalyticsDefinitionService,
        private readonly artifacts: AnalyticsArtifactSources
    ) {}
    execute({ actor, source }: ResolveAnalyticsSourceCommand) {
        if (source.kind === 'definition') return this.definitions.resolve(actor, source)
        if (source.kind === 'artifact') return this.artifacts.resolve(actor, source)
        throw definitionError('invalid')
    }
}
