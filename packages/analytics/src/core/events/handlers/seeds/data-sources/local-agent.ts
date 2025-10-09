import { Employee } from '@metad/server-core'
import { Repository } from 'typeorm'
import { DataSource } from '../../../../../core/entities/internal'
import { DataSourceTypeService } from '../../../../../data-source-type/index'

export async function createLocalAgentDataSource(
	employee: Employee,
	dsRepository: Repository<DataSource>,
	dstService: DataSourceTypeService
) {
	let dataSource = new DataSource()
	dataSource.name = 'Local - Agent DB'
	dataSource.tenantId = employee.tenantId
	dataSource.createdById = employee.userId
	dataSource.organizationId = employee.organizationId
	dataSource.type = await dstService.findOneByWhereOptions({
		tenantId: employee.tenantId,
		type: 'agent',
	})
	dataSource.useLocalAgent = true

	dataSource.options = {
		database: 'mydb.sqlite',
	}
	dataSource = await dsRepository.save(dataSource)
}
