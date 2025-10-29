import { DBQueryRunner } from '@metad/adapter'
import { DataSourceProtocolEnum, DataSourceSyntaxEnum } from '@metad/contracts'
import { environment as env } from '@metad/server-config'
import { RequestContext, Tenant, TenantAwareCrudService, TenantCreatedEvent } from '@metad/server-core'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { InjectEntityManager, InjectRepository } from '@nestjs/typeorm'
import { AdapterBaseOptions, QUERY_RUNNERS } from '@metad/adapter'
import { DataSourceStrategyRegistry } from '@xpert-ai/plugin-sdk'
import chalk from 'chalk'
import { EntityManager, Repository } from 'typeorm'
import { DataSourceType } from './data-source-type.entity'
import { seedDefaultDataSourceTypes } from './data-source-type.seed'

@Injectable()
export class DataSourceTypeService extends TenantAwareCrudService<DataSourceType> {
	private readonly logger = new Logger(DataSourceTypeService.name)
	log = console.log

	@Inject(DataSourceStrategyRegistry)
	private readonly dataSourceStrategyRegistry: DataSourceStrategyRegistry

	constructor(
		@InjectRepository(DataSourceType)
		dsTypeRepository: Repository<DataSourceType>,
		@InjectEntityManager()
		private entityManager: EntityManager,
	) {
		super(dsTypeRepository)
	}

	@OnEvent('tenant.created')
	async handleTenantCreatedEvent(event: TenantCreatedEvent) {
		this.logger.debug('Tenant Created Event: seed dataSource types')
		const { tenantId } = event
		const tenant = await this.entityManager.findOne(Tenant, {where: { id: tenantId }})
		await seedDefaultDataSourceTypes(this.entityManager.connection, tenant)
	}

	async sync() {
		const tenantId = RequestContext.currentTenantId()
		this.log(
			chalk.magenta(
				`🌱 SEEDING DATA SOURCE TYPES ${
					env.production ? 'PRODUCTION' : ''
				} DATABASE FOR TANANT: '${tenantId}'...`
			)
		)
		const queryRunnerClasses = Object.values(QUERY_RUNNERS)
		this.dataSourceStrategyRegistry.list().forEach((strategy) => {
			queryRunnerClasses.push(strategy.getClassType())
		})
		for (const QueryRunner of queryRunnerClasses) {
			const queryRunner = new QueryRunner({} as AdapterBaseOptions)
			try {
				await this.upsertDataSourceType(tenantId, queryRunner)
			} catch (error) {
				this.log(chalk.red(`❌ Failed to seed ${queryRunner.name} data source type: ${error.message}`))
			}
		}
		this.log(chalk.green(`✅ All data source types seeded successfully for tenant: ${tenantId}`))
	}

	async upsertDataSourceType(tenantId: string, queryRunner: DBQueryRunner) {
		const dataSourceType = await this.repository.findOne({
			where: {
				tenantId,
				name: queryRunner.name
			}
		})
		if (!dataSourceType) {
			this.log(chalk.green(`New datasource type '${queryRunner.name}' for tenant: ${tenantId}`))
			return this.create({
				tenantId,
				name: queryRunner.name,
				type: queryRunner.type,
				syntax: queryRunner.syntax as unknown as DataSourceSyntaxEnum,
				protocol: queryRunner.protocol as unknown as DataSourceProtocolEnum,
				configuration: queryRunner.configurationSchema
			})
		} else {
			this.log(chalk.blue(`Update datasource type '${queryRunner.name}' for tenant: ${tenantId}`))
			await this.update(dataSourceType.id, { configuration: queryRunner.configurationSchema } as DataSourceType)
		}
	}
}
