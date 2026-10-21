import { ForbiddenException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { PermissionsEnum } from '@xpert-ai/contracts'
import {
	AnalyticsProviderRegistry,
	RequestContext,
	inspectLegacyAnalyticsSource,
	legacyAnalyticsProviders,
	type DataSourceActor,
	type LegacyAnalyticsSourceInventory
} from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { DataSource } from '../data-source/data-source.entity'
import { authorizeAnalyticsActor } from './analytics-errors'

@Injectable()
export class AnalyticsInventoryService {
	constructor(
		@InjectRepository(DataSource) private readonly sources: Repository<DataSource>,
		private readonly providers: AnalyticsProviderRegistry
	) {}
	async list(actor: DataSourceActor, page: number) {
		this.authorize(actor)
		const [sources, total] = await this.sources.findAndCount({
			where: {
				tenantId: actor.tenantId,
				organizationId: actor.organizationId,
				type: { type: In(Object.keys(legacyAnalyticsProviders)) }
			},
			relations: ['type'],
			order: { id: 'ASC' },
			skip: (page - 1) * 100,
			take: 100
		})
		const providers = this.providers.list(actor.organizationId)
		const items: LegacyAnalyticsSourceInventory[] = []
		for (const source of sources) {
			const available = providers
				.filter((provider) => provider.descriptor.dataSourceTypes.includes(source.type.type))
				.map((provider) => provider.descriptor.id)
			const item = inspectLegacyAnalyticsSource(
				{ id: source.id, type: source.type.type, updatedAt: source.updatedAt, options: source.options },
				available
			)
			if (item) items.push(item)
		}
		this.authorize(actor)
		return { items, total, page, pageSize: 100 }
	}
	private authorize(actor: DataSourceActor) {
		authorizeAnalyticsActor(actor)
		if (!RequestContext.hasPermission(PermissionsEnum.DATA_SOURCE_VIEW))
			throw new ForbiddenException({
				code: 'ANALYTICS_ACCESS_DENIED',
				message: t('server-ai:Error.AnalyticsAccessDenied', { defaultValue: 'Analytics access denied' })
			})
	}
}
