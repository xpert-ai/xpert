import { Injectable, Logger } from '@nestjs/common'
import { InjectEntityManager, InjectRepository } from '@nestjs/typeorm'
import { AdapterBaseOptions, DBQueryRunner, QUERY_RUNNERS } from '@metad/adapter'
import { DataSourceProtocolEnum, DataSourceSyntaxEnum, ITenant } from '@metad/contracts'
import { Tenant, TenantAwareCrudService, TenantCreatedEvent, TenantService } from '@metad/server-core'
import { environment as env } from '@metad/server-config'
import { OnEvent } from '@nestjs/event-emitter'
import chalk from 'chalk'
import { EntityManager, Repository } from 'typeorm'
import { DataSourceType } from './data-source-type.entity'
import { seedDefaultDataSourceTypes } from './data-source-type.seed'

@Injectable()
export class DataSourceTypeService extends TenantAwareCrudService<DataSourceType> {
	private readonly logger = new Logger(DataSourceTypeService.name)
	log = console.log

	constructor(
		@InjectRepository(DataSourceType)
		dsTypeRepository: Repository<DataSourceType>,
		@InjectEntityManager()
		private entityManager: EntityManager,
		private tenantService: TenantService
	) {
		super(dsTypeRepository)
	}

	async seed() {
		this.log(
			chalk.magenta(
				`🌱 SEEDING DATA SOURCE TYPES ${
					env.production ? 'PRODUCTION' : ''
				} DATABASE...`
			)
		)

		const { items = [] } = await this.tenantService.findAll()

		return items.map((tenant) => {
			return Promise.all(
				Object.entries(QUERY_RUNNERS).map(([type, QueryRunner]) => {
					const queryRunner = new QueryRunner({} as AdapterBaseOptions)
					return this.seedDataSourceType(tenant, queryRunner)
				})
			)
		})
	}

	async seedDataSourceType(tenant: ITenant, queryRunner: DBQueryRunner) {
		const dataSourceType = await this.repository.findOne({
			where: {
				tenantId: tenant.id,
				name: queryRunner.name,
			},
		})
		if (!dataSourceType) {
			return this.create({
				tenantId: tenant.id,
				name: queryRunner.name,
				type: queryRunner.type,
				syntax: queryRunner.syntax as unknown as DataSourceSyntaxEnum,
				protocol: queryRunner.protocol as unknown as DataSourceProtocolEnum,
				configuration: queryRunner.configurationSchema,
			})
		} else {
			return Promise.resolve()
		}
	}

	@OnEvent('tenant.created')
	async handleTenantCreatedEvent(event: TenantCreatedEvent) {
		this.logger.debug('Tenant Created Event: seed dataSource types')
		const { tenantId } = event
		const tenant = await this.entityManager.findOne(Tenant, tenantId)
		await seedDefaultDataSourceTypes(this.entityManager.connection, tenant)
	}
}
