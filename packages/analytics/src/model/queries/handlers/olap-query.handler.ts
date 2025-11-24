import { ITryRequest } from '@metad/server-core'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Logger } from '@nestjs/common'
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { Cache } from 'cache-manager'
import { DataSourceOlapQuery } from '../../../data-source'
import { Md5 } from '../../../core/helper'
import { SemanticModelCacheService } from '../../cache/cache.service'
import { SemanticModelService } from '../../model.service'
import { ModelOlapQuery } from '../olap.query'

const CACHE_REDIS_EXPIRES = 10 * 60 // 1min


@QueryHandler(ModelOlapQuery)
export class ModelOlapQueryHandler implements IQueryHandler<ModelOlapQuery> {
	private readonly logger = new Logger(ModelOlapQueryHandler.name)

	constructor(
		private readonly semanticModelService: SemanticModelService,
		private readonly cacheService: SemanticModelCacheService,
		private readonly queryBus: QueryBus,
		@Inject(CACHE_MANAGER)
		private readonly cacheManager: Cache
	) {}

	async execute(query: ModelOlapQuery) {
		const { id, sessionId, modelId, body, forceRefresh, acceptLanguage, isDraft } = query.input
		const user = query.user

		this.logger.verbose(`Executing OLAP query [${id}] for model: ${modelId}`)

		let key = ''
		const model = await this.semanticModelService.findOne(modelId, {
			relations: ['dataSource', 'dataSource.type', 'roles', 'roles.users']
		})

		// Access controls
		const currentUserId = user?.id
		const tenantId = user?.tenantId
		const roleNames = isDraft ? [] : model.roles.filter((role) => role.users.find((user) => user.id === currentUserId))
			.map((role) => role.name)

		// Query
		//   Cache
		const language = model.preferences?.language || acceptLanguage
		
		// Enable caching on the published (non-draft) version.
		let cache: ITryRequest
		let cacheKey = ''
		if (!isDraft && model.preferences?.enableCache) {
			const md5 = new Md5()
			md5.appendStr(body)
			key = md5.end() as string
			// Cache in redis
			cacheKey = `olap:cache:${tenantId}:${modelId}:${language}:${key}`
			if (!forceRefresh) {
				const cached = await this.cacheManager.get(cacheKey)
				if (cached) {
					return {
						data: cached,
						cache: true
					}
				}
			}
			cache = await this.cacheService.findOneOrFailByWhereOptions({ tenantId, modelId, key, language })
			if (cache.success && !forceRefresh) {
				// TODO: Time zone differences
				const period = (new Date().getTime() - cache.record.createdAt.getTime()) / 1000 - 60 * 60 * 8 // seconds
				if (model.preferences.expires && period > model.preferences.expires) {
					await this.cacheService.delete(cache.record.id)
				} else {
					return {
						data: cache.record.data,
						cache: true
					}
				}
			}
		}

		try {
			let queryResult = null
			if (model.dataSource.type.protocol === 'xmla') {
				// Third-party XMLA service
				queryResult = await this.queryBus.execute(
					new DataSourceOlapQuery({
						id,
						sessionId,
						dataSourceId: model.dataSourceId,
						body,
						acceptLanguage: language,
						forceRefresh
					}, query.user)
				)
			} else {
				queryResult = await this.semanticModelService.innerOlap(body, language, roleNames)
			}

			// Proccess ASCII "\u0000", don't know how generated in olap service
			// eslint-disable-next-line no-control-regex
			const queryData = queryResult.data.replace(/\u0000/g, '-')

			if (!isDraft && model.preferences?.enableCache) {
				if (cache?.success) {
					try {
						await this.cacheService.delete(cache.record.id)
					} catch (err) {
						// May have been deleted by another thread
					}
				}

				// Determine whether the Xmla Response contains error information
				if (!queryData.includes('SOAP-ENV:Fault')) {
					await this.cacheService.create({
						tenantId,
						key,
						language,
						modelId,
						query: body,
						data: queryData
					})
					// Cache in redis
					await this.cacheManager.set(cacheKey, queryData, 1000 * CACHE_REDIS_EXPIRES)
				}
			}

			return {
				data: queryData,
				cache: false
			}
		} catch (error) {
			return Promise.reject(error)
		}
	}

}
