import { AdapterBaseOptions, QUERY_RUNNERS } from '@xpert-ai/adapter'
import { DataSourceProtocolEnum, DataSourceSyntaxEnum, ITenant } from '@xpert-ai/contracts'
import { Connection } from 'typeorm'
import { DataSourceType } from './data-source-type.entity'

export const seedDefaultDataSourceTypes = async (
	connection: Connection,
	tenant: ITenant
): Promise<DataSourceType[]> => {
	const types = createDefaultDataSourceTypes(tenant)
	return await connection.manager.save(types)
}

export function createDefaultDataSourceTypes(tenant: ITenant) {
	return Object.entries(QUERY_RUNNERS).map(([type, QueryRunner]) => {
		const queryRunner = new QueryRunner({} as AdapterBaseOptions)
		const dsType = new DataSourceType()
		dsType.tenant = tenant
		dsType.name = queryRunner.name
		dsType.type = queryRunner.type
		dsType.syntax = queryRunner.syntax as unknown as DataSourceSyntaxEnum
		dsType.protocol = queryRunner.protocol as unknown as DataSourceProtocolEnum
		dsType.configuration = queryRunner.configurationSchema
		return dsType
	})
}
