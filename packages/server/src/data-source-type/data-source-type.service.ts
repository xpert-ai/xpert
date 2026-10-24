import { DataSourceProtocolEnum, DataSourceSyntaxEnum } from '@xpert-ai/contracts'
import { environment as env } from '@xpert-ai/server-config'
import { TenantAwareCrudService } from '../core/crud'
import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { RequestContext, DataSourceStrategyRegistry, DBQueryRunner } from '@xpert-ai/plugin-sdk'
import chalk from 'chalk'
import { In, Repository } from 'typeorm'
import { DataSourceType } from './data-source-type.entity'

@Injectable()
export class DataSourceTypeService extends TenantAwareCrudService<DataSourceType> {
	log = console.log

	@Inject(DataSourceStrategyRegistry)
	private readonly dataSourceStrategyRegistry: DataSourceStrategyRegistry

	constructor(
		@InjectRepository(DataSourceType)
		dsTypeRepository: Repository<DataSourceType>
	) {
		super(dsTypeRepository)
	}

	/** Only registered database drivers may appear in the connection type catalog. */
	async available() {
		const types = this.dataSourceStrategyRegistry.list().map((strategy) => new (strategy.getClassType())().type)
		if (!types.length) return { items: [], total: 0 }
		const items = await this.repository.find({
			where: { tenantId: RequestContext.currentTenantId(), type: In(types) },
			order: { name: 'ASC' }
		})
		return { items, total: items.length }
	}

	async sync() {
		const tenantId = RequestContext.currentTenantId()
		this.log(
			chalk.magenta(
				`🌱 SEEDING DATA SOURCE TYPES ${
					env.production ? 'PRODUCTION' : ''
				} DATABASE FOR TENANT: '${tenantId}'...`
			)
		)
		for (const strategy of this.dataSourceStrategyRegistry.list()) {
			const QueryRunner = strategy.getClassType()
			const queryRunner = new QueryRunner()
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
