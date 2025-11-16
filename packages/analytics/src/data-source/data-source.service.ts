import { DataSourceProtocolEnum, IDataSource, IDSSchema, mapTranslationLanguage } from '@metad/contracts'
import { RequestContext, TenantOrganizationAwareCrudService } from '@metad/server-core'
import { QueryBus } from '@nestjs/cqrs'
import { Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import * as _axios from 'axios'
import { addDays } from 'date-fns'
import { I18nService } from 'nestjs-i18n'
import { DeepPartial, Repository } from 'typeorm'
import { DataSourceAuthentication } from './authentication/authentication.entity'
import { DataSource } from './data-source.entity'
import { prepareDataSource } from './utils'
import { DataSourceStrategyQuery } from './queries/index'
import { AdapterBaseOptions, DBQueryRunner } from '@xpert-ai/plugin-sdk'

const axios = _axios.default

@Injectable()
export class DataSourceService extends TenantOrganizationAwareCrudService<DataSource> {
	constructor(
		@InjectRepository(DataSource)
		protected readonly dsRepository: Repository<DataSource>,
		@InjectRepository(DataSourceAuthentication)
		protected readonly authRepository: Repository<DataSourceAuthentication>,
		private configService: ConfigService,
		private readonly i18nService: I18nService,
		private readonly queryBus: QueryBus
	) {
		super(dsRepository)
	}

	async create(entity: DeepPartial<DataSource>, ...options: any[]) {
		const result = await super.create(entity, ...options)
		return this.findOne(result.id, { relations: ['type'] })
	}

	async prepareDataSource(id: string, newDataSource?: Partial<IDataSource>) {
		const {authentications, options, ...ds} = newDataSource ?? {}

		let dataSource = await this.dsRepository.findOne({
			where: {id},
			relations: ['type', 'authentications']
		})
		if (!dataSource) {
			throw new NotFoundException(
				await this.i18nService.t('core.Error.NotFoundException', {
					lang: mapTranslationLanguage(RequestContext.getLanguageCode()),
					args: {
						id
					}
				})
			)
		}

		dataSource.authentications = authentications ?? dataSource.authentications
		dataSource.options = options ? {
			...dataSource.options, ...options
		} : dataSource.options

		dataSource = {
			...dataSource,
			...(ds ?? {})
		} as DataSource

		return prepareDataSource(dataSource)
	}

	async getCatalogs(id: string): Promise<IDSSchema[]> {
		const dataSource = await this.prepareDataSource(id)
		// const runner = createQueryRunnerByType(dataSource.type.type, dataSource.options)
		const runner = await this.queryBus.execute(new DataSourceStrategyQuery(dataSource.type.type, dataSource.options))

		try {
			return await runner.getCatalogs()
		} catch (reason) {
			console.error(reason)
			// rejection
			throw new Error(`配置错误`)
		} finally {
			await runner.teardown()
		}
	}

	async getSchema(id: string, catalog?: string, table?: string, statement?: string): Promise<IDSSchema[]> {
		const dataSource = await this.prepareDataSource(id)
		// const runner = createQueryRunnerByType(dataSource.type.type, dataSource.options)
		const runner = await this.queryBus.execute(new DataSourceStrategyQuery(dataSource.type.type, dataSource.options))

		try {
			if (statement) {
				const tableSchema = await runner.describe(catalog, statement)
				return [{
					name: catalog,
					tables: [tableSchema]
				}]
			}
			return await runner.getSchema(catalog, table)
		} finally {
			await runner.teardown()
		}
	}

	/**
	 * 处理向第三方平台的单个 xmla 请求
	 *
	 * @param id 数据源 ID
	 * @param statement xmla 请求 Body
	 * @param options 选项
	 * @returns
	 */
	async query(id: string, statement: string, options?: any): Promise<any> {
		const dataSource = await this.prepareDataSource(id)
		// const runner = createQueryRunnerByType(dataSource.type.type, dataSource.options)
		const runner = await this.queryBus.execute(new DataSourceStrategyQuery(dataSource.type.type, dataSource.options))

		try {
			return await runner.runQuery(statement, options)
		} finally {
			await runner.teardown()
		}
	}

	async import(id: string, body: any, options) {
		const dataSource = await this.prepareDataSource(id)
		// const runner = createQueryRunnerByType(dataSource.type.type, dataSource.options)
		const runner = await this.queryBus.execute(new DataSourceStrategyQuery(dataSource.type.type, dataSource.options))

		try {
			return await runner.import(body, options)
		} finally {
			await runner.teardown()
		}
	}

	async dropTable(id: string, tableName: any, options) {
		const dataSource = await this.prepareDataSource(id)
		// const runner = createQueryRunnerByType(dataSource.type.type, dataSource.options)
		const runner = await this.queryBus.execute(new DataSourceStrategyQuery(dataSource.type.type, dataSource.options))

		try {
			return await runner.dropTable(tableName, options)
		} finally {
			await runner.teardown()
		}
	}

	async olap(dataSource: DataSource, body: string, acceptLanguage?: string) {
		if (dataSource.type.protocol !== 'xmla') {
			const olapHost = this.configService.get<string>('OLAP_HOST') || 'localhost'
			const olapPort = this.configService.get<string>('OLAP_PORT') || '8080'
			return axios
				.post(`http://${olapHost}:${olapPort}/xmla`, body, {
					headers: {
						Accept: 'text/xml, application/xml, application/soap+xml',
						'Accept-Language': acceptLanguage,
						'Content-Type': 'text/xml'
					}
				})
				.then(({ data }) => data)
		}

		return await this.query(dataSource.id, body, {
			headers: { 'Accept-Language': acceptLanguage }
		}).then(({ data }) => data)
	}

	async ping(dataSource: IDataSource): Promise<any>
	async ping(id: string, dataSource: IDataSource): Promise<any>
	async ping(id: string | IDataSource, dataSource?: IDataSource) {
		let _dataSource: IDataSource
		if (typeof id === 'string') {
			_dataSource = await this.prepareDataSource(id, {
				...dataSource,
				authentications: dataSource.authentications?.map((item) => ({
					...item,
					userId: RequestContext.currentUserId()
				}))
			})
		} else {
			_dataSource = prepareDataSource({
				...id,
				authentications: id.authentications?.map((item) => ({
					...item,
					userId: RequestContext.currentUserId()
				}))
			} as DataSource)
		}

		const runner: DBQueryRunner = await this.queryBus.execute(new DataSourceStrategyQuery(
			_dataSource.type.type, (_dataSource.options ?? {}) as unknown as AdapterBaseOptions
		))
		
		try {
			return await runner.ping()
		} finally {
			await runner.teardown()
		}
	}

	async getMyAuthentication(id: string) {
		const tenantId = RequestContext.currentTenantId()
		const userId = RequestContext.currentUserId()

		const authentication = await this.authRepository.findOneBy({
			tenantId,
			dataSourceId: id,
			userId
		})

		if (!authentication) {
			throw new NotFoundException(id)
		}

		return authentication
	}

	async createAuthentication(id: string, auth) {
		const tenantId = RequestContext.currentTenantId()
		const userId = RequestContext.currentUserId()

		let authentication = await this.authRepository.findOneBy({
			tenantId,
			dataSourceId: id,
			userId
		})

		if (!authentication) {
			authentication = {
				tenantId,
				dataSourceId: id,
				userId
			} as DataSourceAuthentication
		}

		authentication.username = auth.username
		authentication.password = auth.password
		authentication.validUntil = addDays(new Date(), 30)

		return this.authRepository.save(authentication)
	}

	async deleteAuthentication(id: string) {
		const tenantId = RequestContext.currentTenantId()
		const userId = RequestContext.currentUserId()

		await this.authRepository.delete({
			tenantId,
			dataSourceId: id,
			userId
		})
	}

	async findSqlDataSources() {
		const [items, total] = await this.repository.createQueryBuilder("dataSource")
			.leftJoinAndSelect("dataSource.type", "type")
			.where("dataSource.tenantId = :tenantId and dataSource.organizationId = :organizationId and type.protocol = :protocol",
				{
					tenantId: RequestContext.currentTenantId(),
					organizationId: RequestContext.getOrganizationId(),
					protocol: DataSourceProtocolEnum.SQL
				})
			.getManyAndCount()
		return {
			items,
			total
		}
	}
}
