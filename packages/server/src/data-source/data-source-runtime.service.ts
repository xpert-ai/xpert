import { ForbiddenException, Injectable } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { PermissionsEnum } from '@xpert-ai/contracts'
import {
	DataSourceRuntimeCapability,
	RuntimeCapabilityProvider,
	type DataSourceActor as DataSourceRuntimeActor,
	type DataSourceRuntimeApi,
	type DataSourceSummary as DatabaseConnectionSummary,
	type DatabaseLocation,
	type DBQueryRunner,
	type DatabaseWorkbenchAdapter
} from '@xpert-ai/plugin-sdk'
import { Repository } from 'typeorm'
import { RequestContext } from '../core/context'
import { DataSource } from './data-source.entity'
import { DataSourceService } from './data-source.service'
import { DataSourceStrategyQuery } from './queries'

/** Only safe summaries and scoped, independent runners cross the plugin boundary. */
@Injectable()
@RuntimeCapabilityProvider(DataSourceRuntimeCapability)
export class DataSourceRuntimeService implements DataSourceRuntimeApi {
	constructor(
		@InjectRepository(DataSource) private readonly repository: Repository<DataSource>,
		private readonly sources: DataSourceService,
		private readonly queryBus: QueryBus
	) {}

	private authorize(actor: DataSourceRuntimeActor, write = false) {
		if (
			!actor.tenantId ||
			!actor.organizationId ||
			!actor.userId ||
			actor.tenantId !== RequestContext.currentTenantId() ||
			actor.organizationId !== RequestContext.getOrganizationId() ||
			actor.userId !== RequestContext.currentUserId()
		)
			throw new ForbiddenException('Data source scope mismatch')
		if (!RequestContext.hasPermission(write ? PermissionsEnum.DATA_SOURCE_EDIT : PermissionsEnum.DATA_SOURCE_VIEW))
			throw new ForbiddenException('Data source permission denied')
	}

	async list(actor: DataSourceRuntimeActor): Promise<DatabaseConnectionSummary[]> {
		this.authorize(actor)
		const sources = await this.repository.find({
			where: { tenantId: actor.tenantId, organizationId: actor.organizationId },
			relations: ['type'],
			take: 1000
		})
		return sources.flatMap((source) => {
			const engine = source.type.type === 'pg' ? 'postgres' : source.type.type
			return engine === 'mysql' || engine === 'doris' || engine === 'postgres'
				? [{ id: source.id, name: source.name, engine }]
				: []
		})
	}

	async open(input: {
		actor: DataSourceRuntimeActor
		dataSourceId: string
		location?: DatabaseLocation
	}): Promise<DatabaseWorkbenchAdapter> {
		this.authorize(input.actor)
		const source = await this.sources.prepareDataSource(input.dataSourceId)
		const engine = source.type.type === 'pg' ? 'postgres' : source.type.type
		if (!['mysql', 'doris', 'postgres'].includes(engine))
			throw new ForbiddenException('Workbench adapter unavailable')
		if (input.location?.engineCatalog && input.location.engineCatalog !== 'internal')
			throw new ForbiddenException('External catalog unavailable')
		const options = { ...source.options }
		if (engine === 'postgres') {
			if (input.location?.database) options.database = input.location.database
			if (input.location?.schema) options.catalog = input.location.schema
		} else if (input.location?.database) options.catalog = input.location.database
		const runner: DBQueryRunner = await this.queryBus.execute(
			new DataSourceStrategyQuery(source.type.type, options)
		)
		if (!runner.getWorkbenchAdapter) {
			await runner.teardown()
			throw new ForbiddenException('Database plugin upgrade required')
		}
		const adapter = runner.getWorkbenchAdapter()
		let closed = false
		const close = async () => {
			if (!closed) {
				closed = true
				try {
					await adapter.close()
				} finally {
					await runner.teardown()
				}
			}
		}
		const sourceRevision = source.updatedAt?.getTime()
		const check = async (write = false) => {
			this.authorize(input.actor, write)
			if (closed) throw new ForbiddenException('Data source session closed')
			const current = await this.repository.findOne({
				where: {
					id: input.dataSourceId,
					tenantId: input.actor.tenantId,
					organizationId: input.actor.organizationId
				},
				select: { id: true, updatedAt: true }
			})
			if (!current || current.updatedAt?.getTime() !== sourceRevision) {
				await close()
				throw new ForbiddenException('Data source changed; reopen the connection')
			}
		}
		// Proxy preserves method receivers and never exposes resolved credentials or the runner.
		return {
			engine: adapter.engine,
			capabilities: async () => {
				await check()
				return adapter.capabilities()
			},
			locations: async () => {
				await check()
				return adapter.locations()
			},
			objects: async (value) => {
				await check()
				return adapter.objects(value)
			},
			describe: async (value) => {
				await check()
				return adapter.describe(value)
			},
			query: async (value, signal) => {
				await check(value.mode === 'write')
				return adapter.query(value, signal)
			},
			explain: async (value, signal) => {
				await check()
				return adapter.explain(value, signal)
			},
			transaction: async (value) => {
				await check(true)
				return adapter.transaction(value)
			},
			importRows: async (value, signal) => {
				await check(true)
				return adapter.importRows(value, signal)
			},
			cancel: async () => {
				await check()
				return adapter.cancel()
			},
			close
		}
	}
}
