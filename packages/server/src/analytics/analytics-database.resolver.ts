import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { PermissionsEnum, type AnalyticsSourceRef, type AnalyticsSourceSummary } from '@xpert-ai/contracts'
import {
	AnalyticsProviderRegistry,
	DataSourceStrategyRegistry,
	RequestContext,
	type AnalyticsSourceResolver,
	type DataSourceActor,
	type AnalyticsResolvedSource
} from '@xpert-ai/plugin-sdk'
import { DataSource } from '../data-source/data-source.entity'
import { analyticsError, authorizeAnalyticsActor } from './analytics-errors'

@Injectable()
export class DatabaseAnalyticsSourceResolver implements AnalyticsSourceResolver {
	readonly kind = 'data-source' as const
	constructor(
		@InjectRepository(DataSource) private readonly sources: Repository<DataSource>,
		private readonly providers: AnalyticsProviderRegistry,
		private readonly drivers: DataSourceStrategyRegistry
	) {}
	private authorize(actor: DataSourceActor) {
		authorizeAnalyticsActor(actor)
		if (!RequestContext.hasPermission(PermissionsEnum.DATA_SOURCE_VIEW))
			throw analyticsError('ANALYTICS_ACCESS_DENIED')
	}
	private supported(type: string, actor: DataSourceActor) {
		if (!this.drivers.list().some((driver) => new (driver.getClassType())().type === type)) return []
		return this.providers
			.list(actor.organizationId)
			.filter(
				(provider) =>
					provider.descriptor.sourceKinds.includes('data-source') &&
					provider.descriptor.dataSourceTypes?.includes(type)
			)
	}
	async list(actor: DataSourceActor): Promise<AnalyticsSourceSummary[]> {
		authorizeAnalyticsActor(actor)
		if (!RequestContext.hasPermission(PermissionsEnum.DATA_SOURCE_VIEW)) return []
		const result: AnalyticsSourceSummary[] = []
		let skip = 0
		for (;;) {
			const [records, total] = await this.sources.findAndCount({
				where: { tenantId: actor.tenantId, organizationId: actor.organizationId },
				relations: ['type'],
				order: { id: 'ASC' },
				skip,
				take: 100
			})
			for (const record of records) {
				const providers = this.supported(record.type?.type, actor)
				if (providers.length)
					result.push({
						source: { kind: 'data-source', dataSourceId: record.id },
						name: record.name,
						providers: providers.map((provider) => provider.descriptor)
					})
			}
			skip += records.length
			if (skip >= total || !records.length) break
		}
		return result
	}
	async resolve(actor: DataSourceActor, source: AnalyticsSourceRef): Promise<AnalyticsResolvedSource> {
		this.authorize(actor)
		if (source.kind !== 'data-source') throw analyticsError('ANALYTICS_SOURCE_UNAVAILABLE')
		const load = async () => {
			this.authorize(actor)
			const record = await this.sources.findOne({
				where: { id: source.dataSourceId, tenantId: actor.tenantId, organizationId: actor.organizationId },
				relations: ['type']
			})
			if (!record?.type?.type) throw analyticsError('ANALYTICS_SOURCE_UNAVAILABLE')
			const providers = this.supported(record.type.type, actor)
			if (!providers.length) throw analyticsError('ANALYTICS_CAPABILITY_UNAVAILABLE')
			return { record, providers }
		}
		const initial = await load()
		return {
			source,
			providerIds: initial.providers.map((provider) => provider.descriptor.id),
			options: {},
			revalidate: async () => {
				const current = await load()
				if (
					current.record.updatedAt?.getTime() !== initial.record.updatedAt?.getTime() ||
					current.record.typeId !== initial.record.typeId
				)
					throw analyticsError('ANALYTICS_SOURCE_CHANGED')
			}
		}
	}
}
