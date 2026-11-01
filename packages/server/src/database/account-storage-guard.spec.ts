import { EntityMetadata } from 'typeorm'
import { registerAccountStorageRelations } from './account-storage-guard'

function entity(tableName: string, columns: string[], schema?: string): EntityMetadata {
	return { tableName, schema, columns: columns.map((databaseName) => ({ databaseName })) } as EntityMetadata
}

describe('account storage relation registration', () => {
	it('registers only entities declaring both scope columns, regardless of table name', async () => {
		const connection = { query: jest.fn().mockResolvedValue(undefined) }
		await registerAccountStorageRelations(connection, [
			entity('ordinary_business', ['tenantId', 'organizationId']),
			entity('plugin_tenant_only', ['tenantId']),
			entity('plugin_org_only', ['organizationId']),
			entity('plugin_unscoped', ['id']),
			entity('plugin_mapped', ['tenant_id', 'organization_id'])
		])
		expect(connection.query).toHaveBeenCalledTimes(1)
		expect(connection.query).toHaveBeenCalledWith('SELECT xpert_app_storage_register_relation($1::regclass)', [
			'"ordinary_business"'
		])
	})

	it('quotes schema and table identifiers and passes them as a parameter', async () => {
		const connection = { query: jest.fn().mockResolvedValue(undefined) }
		await registerAccountStorageRelations(connection, [
			entity('table"name', ['tenantId', 'organizationId'], 'schema"name')
		])
		expect(connection.query).toHaveBeenCalledWith('SELECT xpert_app_storage_register_relation($1::regclass)', [
			'"schema""name"."table""name"'
		])
	})

	it('propagates failed registration and stops before subsequent tables', async () => {
		const connection = { query: jest.fn().mockRejectedValue(new Error('registration failed')) }
		await expect(
			registerAccountStorageRelations(connection, [
				entity('first', ['tenantId', 'organizationId']),
				entity('second', ['tenantId', 'organizationId'])
			])
		).rejects.toThrow('registration failed')
		expect(connection.query).toHaveBeenCalledTimes(1)
	})
})
