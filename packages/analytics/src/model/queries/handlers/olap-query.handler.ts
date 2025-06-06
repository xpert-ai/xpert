import { ITryRequest } from '@metad/server-core'
import { Logger } from '@nestjs/common'
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { DataSourceOlapQuery } from '../../../data-source'
import { Md5 } from '../../../core/helper'
import { SemanticModelCacheService } from '../../cache/cache.service'
import { SemanticModelService } from '../../model.service'
import { ModelOlapQuery } from '../olap.query'


@QueryHandler(ModelOlapQuery)
export class ModelOlapQueryHandler implements IQueryHandler<ModelOlapQuery> {
	private readonly logger = new Logger(ModelOlapQueryHandler.name)

	constructor(
		private readonly semanticModelService: SemanticModelService,
		private readonly cacheService: SemanticModelCacheService,
		private readonly queryBus: QueryBus
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
		// const currentUserId = RequestContext.currentUserId()
		const currentUserId = user?.id
		const tenantId = user?.tenantId
		const roleNames = isDraft ? [] : model.roles.filter((role) => role.users.find((user) => user.id === currentUserId))
			.map((role) => role.name)

		// Query
		//   Cache
		const language = model.preferences?.language || acceptLanguage
		let cache: ITryRequest
		if (model.preferences?.enableCache) {
			const md5 = new Md5()
			md5.appendStr(body)
			key = md5.end() as string
			cache = await this.cacheService.findOneOrFail({ where: { tenantId, modelId, key, language } })
			if (cache.success && !forceRefresh) {
				// TODO 时区有差异
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
				// 第三方平台 xmla 服务

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
			const queryData = queryResult.data.replace(/\u0000/g, '-')

			if (model.preferences?.enableCache) {
				if (cache?.success) {
					try {
						await this.cacheService.delete(cache.record.id)
					} catch (err) {
						// 可能已被其他线程删除
					}
				}

				// 判断 Xmla Response 是否包含错误信息
				if (!queryData.includes('SOAP-ENV:Fault')) {
					await this.cacheService.create({
						tenantId,
						key,
						language,
						modelId,
						query: body,
						data: queryData
					})
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
