import { Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import * as _axios from 'axios'
import { AxiosResponse } from 'axios'
import { DataSourceService } from '../../data-source.service'
import { prepareDataSource } from '../../utils'
import { DataSourceOlapQuery } from '../olap.query'
import { DataSourceStrategyQuery } from '../datasource.strategy.query'
import { DBQueryRunner } from '@xpert-ai/plugin-sdk'

const axios = _axios.default

// Cache for db query runners
const runners: Record<string, Record<string, { runner: DBQueryRunner; expirationTimes: number }>> = {}
const OBJECT_LIFETIME = 1000 * 60 * 10 // 10m

@QueryHandler(DataSourceOlapQuery)
export class OlapQueryHandler implements IQueryHandler<DataSourceOlapQuery> {
	private readonly logger = new Logger(OlapQueryHandler.name)

	constructor(
		private readonly dsService: DataSourceService,
		private configService: ConfigService,
		private readonly queryBus: QueryBus
	) {}

	async execute(query: DataSourceOlapQuery) {
		const { id, sessionId, dataSourceId, body, forceRefresh, acceptLanguage } = query.input
		const user = query.user

		this.logger.verbose(`Executing OLAP query [${id}] for dataSource: ${dataSourceId}`)

		let dataSource = await this.dsService.findOne(dataSourceId, {
			relations: ['type', 'authentications']
		})

		if (dataSource.type.protocol !== 'xmla') {
			const olapHost = this.configService.get<string>('OLAP_HOST') || 'localhost'
			const olapPort = this.configService.get<string>('OLAP_PORT') || '8080'
			const result = await axios.post(`http://${olapHost}:${olapPort}/xmla`, body, {
				headers: {
					Accept: 'text/xml, application/xml, application/soap+xml',
					'Accept-Language': acceptLanguage || '',
					'Content-Type': 'text/xml'
				}
			})
			return result.data
		}

		let _runner: DBQueryRunner
		// Get runner from cache firstly
		if (runners[sessionId]?.[dataSourceId]) {
			const { runner } = runners[sessionId][dataSourceId]
			_runner = runner
		} else {
			// Determine the user authentication
			dataSource = prepareDataSource(dataSource, user?.id)
			// _runner = createQueryRunnerByType(dataSource.type.type, dataSource.options)
			_runner = await this.queryBus.execute(new DataSourceStrategyQuery(dataSource.type.type, dataSource.options))
			runners[sessionId] ??= {}
			runners[sessionId][dataSourceId] = {
				runner: _runner,
				expirationTimes: Date.now() + OBJECT_LIFETIME
			}
		}

		const result: AxiosResponse<any> = (await _runner.runQuery(body, {
			headers: { 'Accept-Language': acceptLanguage || '' }
		})) as AxiosResponse<any>

		return {
			data: result.data,
			cache: false
		}
	}
}

/**
 * Interval to clean cache of query runners
 */
setInterval(() => {
	const now = Date.now()
	Object.keys(runners).forEach((sessionId) => {
		Object.keys(runners[sessionId]).forEach((dataSourceId) => {
			if (runners[sessionId][dataSourceId].expirationTimes < now) {
				// Teardown the runner object
				runners[sessionId][dataSourceId].runner.teardown()
				delete runners[sessionId][dataSourceId]
				if (!Object.keys(runners[sessionId]).length) {
					delete runners[sessionId]
				}
			}
		})
	})
}, 60000 * 10) // 每10分钟检查一次
