import { EntityMetadata } from 'typeorm'

/** Only explicitly registered entity metadata supplies table identity; no plugin-name heuristics. */
export async function registerAccountStorageRelations(
	connection: { query(sql: string, parameters: string[]): Promise<unknown> },
	entities: readonly EntityMetadata[]
) {
	for (const entity of entities) {
		if (
			!['tenantId', 'organizationId'].every((name) =>
				entity.columns.some((column) => column.databaseName === name)
			)
		)
			continue
		const quote = (value: string) => '"' + value.replace(/"/g, '""') + '"'
		const qualified = [entity.schema, entity.tableName]
			.filter((value): value is string => Boolean(value))
			.map(quote)
			.join('.')
		await connection.query('SELECT xpert_app_storage_register_relation($1::regclass)', [qualified])
	}
}
