import { ForbiddenException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { PermissionsEnum } from '@xpert-ai/contracts'
import {
	DataSourceRuntimeCapability,
	DataSourceStrategyRegistry,
	RuntimeCapabilityProvider,
	type DataSourceActor as DataSourceRuntimeActor,
	type DataSourceRuntimeApi,
	type DataSourceSummary as DatabaseConnectionSummary,
	type DatabaseLocation,
	type DBQueryRunner,
	type DatabaseWorkbenchAdapter
} from '@xpert-ai/plugin-sdk'
import { Repository } from 'typeorm'
import { t } from 'i18next'
import { RequestContext } from '../core/context'
import { DataSource } from './data-source.entity'
import { DataSourceService } from './data-source.service'

/** Only safe summaries and scoped, independent runners cross the plugin boundary. */
@Injectable()
@RuntimeCapabilityProvider(DataSourceRuntimeCapability)
export class DataSourceRuntimeService implements DataSourceRuntimeApi {
	constructor(
		@InjectRepository(DataSource) private readonly repository: Repository<DataSource>,
		private readonly sources: DataSourceService,
		private readonly strategies: DataSourceStrategyRegistry
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
		const strategies = new Map(this.strategies.list().map((strategy) => [strategy.type, strategy]))
		return sources.flatMap((source) => {
			const strategy = strategies.get(source.type.type)
			return strategy?.workbench ? [{ id: source.id, name: source.name, engine: strategy.workbench.engine }] : []
		})
	}

	async open(input: {
		actor: DataSourceRuntimeActor
		dataSourceId: string
		location?: DatabaseLocation
	}): Promise<DatabaseWorkbenchAdapter> {
		this.authorize(input.actor)
		const source = await this.sources.prepareDataSource(input.dataSourceId)
		const strategy = this.strategies.get(source.type.type)
		if (!strategy?.workbench) throw new ForbiddenException('Database plugin upgrade required')
		// Independent runner; saved credentials and trusted identity are never supplied by tool input.
		const runner: DBQueryRunner = await strategy.create({ ...source.options })
		let adapter: DatabaseWorkbenchAdapter
		try {
			if (!runner.getWorkbenchAdapter) throw new ForbiddenException('Database plugin upgrade required')
			adapter = runner.getWorkbenchAdapter(input.location ? { ...input.location } : undefined)
		} catch (error) {
			await runner.teardown()
			throw error
		}
		if (adapter.engine !== strategy.workbench.engine) {
			try {
				await adapter.close()
			} finally {
				await runner.teardown()
			}
			throw new ForbiddenException(
				t('server-ai:Error.DatabaseAdapterRegistrationMismatch', {
					defaultValue: 'Database adapter does not match its registration'
				})
			)
		}
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
