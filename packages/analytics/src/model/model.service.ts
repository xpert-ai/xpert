import {
	BusinessAreaRole,
	ChecklistItem,
	DataSourceProtocolEnum,
	ISemanticModel,
	IUser,
	mapTranslationLanguage,
	SemanticModelStatusEnum,
	TSemanticModelDraft,
	Visibility
} from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { FindOptionsWhere, ITryRequest, PaginationParams, REDIS_CLIENT, RequestContext, User } from '@metad/server-core'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { CommandBus, EventBus, QueryBus } from '@nestjs/cqrs'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { InjectRepository } from '@nestjs/typeorm'
import * as _axios from 'axios'
import chalk from 'chalk'
import { I18nService } from 'nestjs-i18n'
import { RedisClientType } from 'redis'
import { FindManyOptions, FindOneOptions, ILike, Repository } from 'typeorm'
import { Cache } from 'cache-manager'
import { t } from 'i18next'
import { BusinessAreaAwareCrudService } from '../core/crud/index'
import { SemanticModelCache, SemanticModelQueryLog } from '../core/entities/internal'
import { Md5 } from '../core/helper'
import { BusinessArea, BusinessAreaService } from '../business-area'
import { DataSourceService } from '../data-source'
import { ModelQueryLogService } from '../model-query-log'
import { SemanticModelCacheService } from './cache/cache.service'
import { SemanticModelPublicDTO, SemanticModelQueryDTO } from './dto'
import { SemanticModelUpdatedEvent } from './events'
import { updateXmlaCatalogContent } from './helper'
import { SemanticModel } from './model.entity'
import { NgmDSCoreService, registerSemanticModel } from './ocap'
import { CubeValidator, DimensionValidator, RoleValidator, VirtualCubeValidator } from './validators'
import { EVENT_SEMANTIC_MODEL_DELETED, SemanticModelDeletedEvent } from './types'

const axios = _axios.default

@Injectable()
export class SemanticModelService extends BusinessAreaAwareCrudService<SemanticModel> {
	private readonly logger = new Logger(SemanticModelService.name)

	constructor(
		@InjectRepository(SemanticModel)
		public modelRepository: Repository<SemanticModel>,
		private readonly dsService: DataSourceService,
		private readonly cacheService: SemanticModelCacheService,
		private readonly configService: ConfigService,
		private readonly businessAreaService: BusinessAreaService,
		private readonly logService: ModelQueryLogService,
		private readonly i18nService: I18nService,
		commandBus: CommandBus,
		private readonly queryBus: QueryBus,
		private readonly eventBus: EventBus,
		private readonly eventEmitter: EventEmitter2,
		@Inject(REDIS_CLIENT)
		private readonly redisClient: RedisClientType,
		@Inject(CACHE_MANAGER)
		private readonly cacheManager: Cache,
		/**
		 * Core service of ocap framework
		 */
		private readonly dsCoreService: NgmDSCoreService
	) {
		super(modelRepository, commandBus)
	}

	/**
	 * Semantic model usually uses id to directly access the interface instead of organizationId, so the organizationId forced filtering is removed here
	 *
	 * @param user
	 * @returns
	 */
	protected findConditionsWithTenantByUser(user: User): FindOptionsWhere<SemanticModel> {
		const organizationId = RequestContext.getOrganizationId()
		const organizationWhere = organizationId
			? {
					organization: {
						id: organizationId
					}
				}
			: {}

		return {
			tenant: {
				id: user.tenantId
			},
			...organizationWhere
		}
	}

	async seedIfEmpty() {
		setTimeout(async () => {
			const { items } = await this.findAll({
				where: {
					status: SemanticModelStatusEnum.Progressing
				},
				relations: ['dataSource', 'dataSource.type', 'roles']
			})

			let seeds = items.length
			console.log(`Found ${seeds} active models in system`)
			for await (const model of items) {
				try {
					await this.updateCatalogContent(model.id)
				} catch (error) {
					seeds--
					console.log(chalk.red(`When update model '${model.id}' xmla schema: ${getErrorMessage(error)}`))
				}
			}
			if (seeds) {
				console.log(chalk.green(`Seed '${seeds}' models xmla schema`))
			}
			if (items.length - seeds) {
				console.log(chalk.red(`Fail seed '${items.length - seeds}' models xmla schema`))
			}

			/**
			 * Register semantic models
			 *
			 * @deprecated use in query
			 */
			items.forEach((model) => {
				try {
					registerSemanticModel(model, false, this.dsCoreService)
				} catch (err) {
					console.log(chalk.red(`Error registering semantic model: ${err.message}`))
				}
			})
		}, 1000)
	}

	/**
	 * Update the xmla catalog content for olap engine
	 *
	 * @deprecated use SemanticModelUpdatedEvent
	 *
	 * @param id Model id
	 * @returns
	 */
	async updateCatalogContent(id: string) {
		const model = await this.repository.findOne({
			where: { id },
			relations: ['dataSource', 'dataSource.type', 'roles']
		})

		// Update Xmla Schema into Redis for model
		await updateXmlaCatalogContent(this.queryBus, this.redisClient, model)

		// Update draft
		await updateXmlaCatalogContent(this.queryBus, this.redisClient, {
			...model,
			...(model.draft ?? {}),
			options: {
				schema: model.draft?.schema ?? model.options?.schema,
				settings: model.draft?.settings ?? model.options?.settings
			},
			id: `${model.id}/draft`
		})

		// Clear cache for model
		try {
			await this.cacheService.delete({ tenantId: model.tenantId, modelId: model.id })
		} catch (err) {
			//
		}
	}

	async query(modelId: string, query: { statement: string }, options: Record<string, unknown>) {
		const model = await this.repository.findOne({
			where: { id: modelId },
			relations: ['dataSource', 'dataSource.type']
		})
		return this.dsService.query(model.dataSourceId, query.statement, {
			...options,
			catalog: model.catalog
		})
	}

	async import(modelId: string, body: any) {
		const model = await this.repository.findOne({
			where: { id: modelId },
			relations: ['dataSource', 'dataSource.type']
		})
		return this.dsService.import(model.dataSourceId, body, { catalog: model.catalog })
	}

	async dropTable(modelId: string, tableName: string) {
		const model = await this.repository.findOne({
			where: { id: modelId },
			relations: ['dataSource', 'dataSource.type']
		})
		return this.dsService.dropTable(model.dataSourceId, tableName, { catalog: model.catalog })
	}

	/**
	 * Single XmlA request for Semantic Model
	 *
	 * @deprecated use {@link ModelOlapQuery} instead
	 *
	 * @param modelId Model ID
	 * @param query Query XML Body Data
	 * @returns
	 */
	async olap(modelId: string, query: string, options?: { acceptLanguage?: string; forceRefresh?: boolean }) {
		this.logger.warn(`@deprecated use {@link ModelOlapQuery} instead`)

		let key = ''

		const model = await this.repository.findOne({
			where: { id: modelId },
			relations: ['dataSource', 'dataSource.type', 'roles', 'roles.users']
		})

		// Access controls
		const currentUserId = RequestContext.currentUserId()
		const roleNames = model.roles
			.filter((role) => role.users.find((user) => user.id === currentUserId))
			.map((role) => role.name)

		// Query
		//   Cache
		const language = model.preferences?.language || options?.acceptLanguage
		let cache: ITryRequest
		if (model.preferences?.enableCache) {
			const md5 = new Md5()
			md5.appendStr(query)
			key = md5.end() as string
			cache = await this.cacheService.findOneOrFailByWhereOptions({ modelId, key, language })
			if (cache.success && !options?.forceRefresh) {
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
				queryResult = await this.dsService.query(model.dataSourceId, query, {
					headers: { 'Accept-Language': language || '' }
				})
			} else {
				queryResult = await this.innerOlap(query, language, roleNames)
			}

			// Proccess ASCII "\u0000", don't know how generated in olap service
			// eslint-disable-next-line no-control-regex
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
						key,
						language,
						modelId,
						query,
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

	async innerOlap(query: string, language: string, roleNames?: string[]) {
		const olapHost = this.configService.get<string>('OLAP_HOST') || 'localhost'
		const olapPort = this.configService.get<string>('OLAP_PORT') || '8080'

		const headers = {
			Accept: 'text/xml; application/xml; application/soap+xml; charset=UTF-8',
			'Accept-Language': language || '',
			'Content-Type': 'text/xml; charset=UTF-8'
		}

		if (roleNames?.length) {
			headers['mondrian-role'] = roleNames.map((_) => encodeURIComponent(_)).join(',')
		}

		try {
			return await axios.post(`http://${olapHost}:${olapPort}/xmla`, query, { 
				headers,
				timeout: 30000 // Set timeout to 30 seconds
			})
		} catch (err: any) {
			this.logger.error(`Failed to connect to OLAP engine at ${olapHost}:${olapPort}`, err)
			// Provide detailed error message based on error type
			let errorMessage = t('analytics:Error.FailedConnectToOLAP')
			if (err?.code === 'ECONNREFUSED') {
				errorMessage = t('analytics:Error.FailedConnectToOLAP') + ` Connection refused at ${olapHost}:${olapPort}. Please check if the OLAP service is running.`
			} else if (err?.code === 'ETIMEDOUT' || err?.code === 'ECONNABORTED') {
				errorMessage = t('analytics:Error.FailedConnectToOLAP') + ` Connection timeout at ${olapHost}:${olapPort}. Please check network connectivity and service status.`
			} else if (err?.response) {
				errorMessage = t('analytics:Error.FailedConnectToOLAP') + ` OLAP engine returned error: ${err.response.status} ${err.response.statusText}`
			} else if (err?.message) {
				errorMessage = t('analytics:Error.FailedConnectToOLAP') + ` ${err.message}`
			} else {
				errorMessage = t('analytics:Error.FailedConnectToOLAP') + ` (${olapHost}:${olapPort})`
			}
			throw new Error(errorMessage)
		}
	}

	public async search(text: string) {
		let where = null
		if (text) {
			text = `%${text}%`
			where = [
				{
					name: ILike(text)
				}
			]
		}
		const condition = await this.myBusinessAreaConditions({
			where,
			order: {
				updatedAt: 'DESC'
			},
			take: 20
		})

		const [items, total] = await this.repository.findAndCount(condition)

		return {
			total,
			// limit public attributes
			items: items.map((item) => new SemanticModelQueryDTO(item))
		}
	}

	/**
	 * Get the models I have permission to
	 *
	 * @param conditions
	 * @returns
	 */
	async findMy(conditions?: FindManyOptions<SemanticModel>) {
		const condition = await this.myBusinessAreaConditions(conditions, BusinessAreaRole.Modeler)

		const [items, total] = await this.repository.findAndCount(condition)

		return {
			total,
			items
		}
	}

	/**
	 * Get the models I created
	 *
	 * @returns
	 */
	async findMyOwn() {
		const me = RequestContext.currentUser()
		return this.findAll({
			where: this.findConditionsWithUser(me)
		})
	}

	/**
	 * Find one semantic model by id for OCAP with cache.
	 * 
	 * @cache semantic model cache 1 minute
	 */
	async findOne4Ocap(id: string, params: {withIndicators?: boolean; skipCache?: boolean} = {}) {
		const { withIndicators, skipCache } = params ?? {}
		const cacheKey = `analytics:semantic-model:${id}`
		
		let model: ISemanticModel = await this.cacheManager.get(cacheKey)
		if (!model || skipCache) {
			model = await this.findOne(id, {
				relations: ['dataSource', 'dataSource.type', 'roles', 'roles.users',].concat(withIndicators ? ['indicators'] : [])
			})
			await this.cacheManager.set(cacheKey, model, 1000 * 60) // 1 minute cache
		}

		return model
	}

	/**
	 * Clear the cache of semantic model
	 * @param id 
	 */
	async clearOne4Ocap(id: string) {
		const cacheKey = `analytics:semantic-model:${id}`
		try {
			await this.cacheManager.del(cacheKey)
		} catch (err) {
			this.logger.error(err)
		}
	}

	public async checkViewerAuthorization(id: string | number) {
		const userId = RequestContext.currentUserId()
		const model = await this.findOne(id, { relations: ['businessArea', 'members'] })

		if (model.createdById === userId || model.members.find((member) => member.id === userId)) {
			return
		}

		if (model.businessArea) {
			const businessAreaUser = await this.businessAreaService.getAccess(model.businessArea as BusinessArea)
			if (businessAreaUser) {
				return
			}
		}

		throw new UnauthorizedException('Access reject')
	}

	public async checkUpdateAuthorization(id: string | number) {
		const userId = RequestContext.currentUserId()
		const model = await this.findOne(id, { relations: ['businessArea'] })

		if (model.businessArea) {
			const businessAreaUser = await this.businessAreaService.getAccess(model.businessArea as BusinessArea)
			if (businessAreaUser?.role > 1) {
				throw new UnauthorizedException('Access reject')
			}
		} else if (model.createdById !== userId) {
			throw new UnauthorizedException('Not yours')
		}
	}

	async updateMembers(id: string, members: string[]) {
		const project = await this.findOne(id)
		project.members = members.map((id) => ({ id }) as IUser)
		await this.repository.save(project)

		return await this.findOne(id, { relations: ['members'] })
	}

	async deleteMember(id: string, memberId: string) {
		const project = await this.findOne(id, { relations: ['members'] })
		project.members = project.members.filter(({ id }) => id !== memberId)
		await this.repository.save(project)
	}

	async getCubes(id: string) {
		const model = await this.findOne(id)

		const items = []
		model.options?.schema?.cubes?.forEach((cube) => {
			items.push({
				name: cube.name,
				caption: cube.caption,
				description: cube.description,
			})
		})
		model.options?.schema?.virtualCubes?.forEach((cube) => {
			items.push({
				name: cube.name,
				caption: cube.caption,
				description: cube.description,
			})
		})
		return items
	}

	async getLogs(data: PaginationParams<SemanticModelQueryLog>) {
		return this.logService.findAll(data)
	}

	async getCaches(data: PaginationParams<SemanticModelCache>) {
		return this.cacheService.findAll(data)
	}

	/**
	 * Update draft (Avoiding version lock checks)
	 * 
	 * @todo consider using version lock
	 * 
	 * @param id 
	 * @param draft 
	 * @returns 
	 */
	async updateDraft(id: string, draft: TSemanticModelDraft) {
		const model = await this.findOne(id)
		return this.saveDraft(id, {
			...model.draft,
			...draft
		} as TSemanticModelDraft)
	}

	async saveDraft(id: string, draft: TSemanticModelDraft) {
		const model = await this.findOne(id, {relations: ['dataSource', 'dataSource.type']})
		if (model.draft?.version && model.draft.version !== draft.version) {
			throw new NotFoundException(
				await this.i18nService.t('analytics.Error.SemanticModelDraftVersionNotFound', {
					lang: mapTranslationLanguage(RequestContext.getLanguageCode()),
					args: {
						model: id,
						version: draft.version
					}
				})
			)
		}
		model.draft = {
			...draft,
			savedAt: new Date(),
			version: model.draft?.version ? model.draft.version + 1 : 1
		} as TSemanticModelDraft

		model.draft.checklist = model.dataSource.type.protocol === DataSourceProtocolEnum.XMLA ? null : await this.validate(model.draft)

		await this.repository.save(model)

		this.eventBus.publish(new SemanticModelUpdatedEvent(id))
		return model
	}

	async validate(draft: TSemanticModelDraft) {
		const dimensionValidator = new DimensionValidator()
		const cubeValidator = new CubeValidator(this.commandBus, draft.dataSourceId, draft.catalog)
		const virtualCubeValidator = new VirtualCubeValidator()
		const roleValidator = new RoleValidator()

		const results: ChecklistItem[] = []

		try {
			for await (const dimension of draft.schema?.dimensions ?? []) {
				const res = await dimensionValidator.validate(dimension, { schema: draft.schema })
				results.push(...res)
			}
			for await (const cube of draft.schema?.cubes ?? []) {
				const res = await cubeValidator.validate(cube, { schema: draft.schema })
				results.push(...res)
			}
			for await (const cube of draft.schema?.virtualCubes ?? []) {
				const res = await virtualCubeValidator.validate(cube, { schema: draft.schema })
				results.push(...res)
			}
			for await (const role of draft.roles ?? []) {
				const res = await roleValidator.validate(role, { schema: draft.schema })
				results.push(...res)
			}
		} catch (err) {
			console.error(err)
			results.push({
				message: {
					en_US: 'Internal error: ' + getErrorMessage(err),
					zh_Hans: '内部错误：' + getErrorMessage(err)
				},
				level: 'error',
				ruleCode: 'MODEL_VALIDATION_INTERNAL_ERROR'
			})
		}

		return results
	}

	async updateModelOptions(id: string, fn: (options: ISemanticModel['options']) => ISemanticModel['options']) {
		const model = await this.findOne(id)
		model.options = fn(model.options)
		return await this.repository.save(model)
	}

	async delete(id: string) {
		try {
		    await this.eventEmitter.emitAsync(EVENT_SEMANTIC_MODEL_DELETED, new SemanticModelDeletedEvent(id))
		} catch (err) {
			console.error(err)
		}
		return super.delete(id)
	}

	/*
    |--------------------------------------------------------------------------
    | Public API
    |--------------------------------------------------------------------------
    */
	async findPublicOne(id: string, options?: FindOneOptions) {
		const model = await this.repository.findOne({
			relations: options?.relations,
			where: {
				id,
				visibility: Visibility.Public
			}
		})

		if (!model) {
			throw new NotFoundException(
				await this.i18nService.t('analytics.Error.SemanticModelNotFound', {
					lang: mapTranslationLanguage(RequestContext.getLanguageCode()),
					args: {
						model: id
					}
				})
			)
		}

		return new SemanticModelPublicDTO(model)
	}
}
