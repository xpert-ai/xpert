import { BusinessAreaRole, ChecklistItem, extractSemanticModelDraft, ISemanticModel, IUser, mapTranslationLanguage, RuleValidator, SemanticModelStatusEnum, TSemanticModelDraft, Visibility } from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { FindOptionsWhere, ITryRequest, PaginationParams, REDIS_CLIENT, RequestContext, User } from '@metad/server-core'
import { Inject, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { CommandBus, EventBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import * as _axios from 'axios'
import chalk from 'chalk'
import { RedisClientType } from 'redis'
import { FindManyOptions, FindOneOptions, ILike, Repository } from 'typeorm'
import { I18nService } from 'nestjs-i18n'
import { BusinessArea, BusinessAreaService } from '../business-area'
import { BusinessAreaAwareCrudService } from '../core/crud/index'
import { Md5 } from '../core/helper'
import { DataSourceService } from '../data-source/data-source.service'
import { SemanticModelCacheService } from './cache/cache.service'
import { SemanticModelPublicDTO, SemanticModelQueryDTO } from './dto'
import { updateXmlaCatalogContent } from './helper'
import { SemanticModel } from './model.entity'
import { NgmDSCoreService, registerSemanticModel } from './ocap'
import { ModelQueryLogService } from '../model-query-log'
import { SemanticModelQueryLog } from '../core/entities/internal'
import { SemanticModelUpdatedEvent } from './events'
import { DimensionValidator, RoleValidator } from './mdx/validators'
import { Schema } from '@metad/ocap-core'

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
		private readonly eventBus: EventBus,
		@Inject(REDIS_CLIENT)
		private readonly redisClient: RedisClientType,
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
			} catch(error) {
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
		const model = await this.repository.findOne(id, {
			relations: ['dataSource', 'dataSource.type', 'roles']
		})

		// Update Xmla Schema into Redis for model
		await updateXmlaCatalogContent(this.redisClient, model)

		// Update draft
		await updateXmlaCatalogContent(this.redisClient, {...model, ...(model.draft ?? {}), options: {
			schema: model.draft?.schema ?? model.options?.schema,
			settings: model.draft?.settings ?? model.options?.settings,
		}, id: `${model.id}/draft`})
		
		// Clear cache for model
		try {
			await this.cacheService.delete({ modelId: model.id })
		} catch (err) {
			//
		}
	}

	async query(modelId: string, query: { statement: string }, options: Record<string, unknown>) {
		const model = await this.repository.findOne(modelId, {
			relations: ['dataSource', 'dataSource.type']
		})
		return this.dsService.query(model.dataSourceId, query.statement, {
			...options,
			catalog: model.catalog
		})
	}

	async import(modelId: string, body: any) {
		const model = await this.repository.findOne(modelId, {
			relations: ['dataSource', 'dataSource.type']
		})
		return this.dsService.import(model.dataSourceId, body, { catalog: model.catalog })
	}

	async dropTable(modelId: string, tableName: string) {
		const model = await this.repository.findOne(modelId, {
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

		const model = await this.repository.findOne(modelId, {
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
			cache = await this.cacheService.findOneOrFail({ where: { modelId, key, language } })
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
			'Content-Type': 'text/xml; charset=UTF-8',
		}
		
		if (roleNames?.length) {
			headers['mondrian-role'] = roleNames.map((_) => encodeURIComponent(_)).join(',')
		}

		try {
			return await axios.post(`http://${olapHost}:${olapPort}/xmla`, query, { headers })
		} catch (err) {
			this.logger.error(err)
			throw new Error(`Can't connect olap service`)
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

	async saveDraft(id: string, draft: TSemanticModelDraft) {
		const model = await this.findOne(id)
		draft.savedAt = new Date()
		model.draft = {
			...draft,
		} as TSemanticModelDraft

		model.draft.checklist = await this.validate(model.draft)

		await this.repository.save(model)

		this.eventBus.publish(new SemanticModelUpdatedEvent(id))
		return model
	}

	async validate(draft: TSemanticModelDraft) {
		const dimensionValidator = new DimensionValidator()
		const roleValidator = new RoleValidator()

		const results: ChecklistItem[] = [];

		for await (const dimension of draft.schema?.dimensions ?? []) {
			const res = await dimensionValidator.validate(dimension, {schema: draft.schema})
			results.push(...res)
		}
		for await (const role of draft.roles ?? []) {
			const res = await roleValidator.validate(role, {schema: draft.schema})
			results.push(...res)
		}

		return results
	}

	/*
    |--------------------------------------------------------------------------
    | Public API
    |--------------------------------------------------------------------------
    */
	async findPublicOne(id: string, options?: FindOneOptions) {
		const model = await this.repository.findOne(id, {
			relations: options?.relations,
			where: {
				visibility: Visibility.Public,
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
