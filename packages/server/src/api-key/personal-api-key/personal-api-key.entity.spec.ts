import { DataSource } from 'typeorm'
import { coreEntities } from '../../core/entities'
import { ApiKey } from '../api-key.entity'

class MetadataDataSource extends DataSource {
	buildSchemaMetadata() {
		return this.buildMetadatas()
	}
}

describe('Personal API key persistence registration', () => {
	it('extends the registered api_key schema without a separate personal key entity', async () => {
		const source = new MetadataDataSource({ type: 'postgres', entities: coreEntities })
		await source.buildSchemaMetadata()
		const metadata = source.getMetadata(ApiKey)
		expect(metadata.tableName).toBe('api_key')
		expect(source.entityMetadatas.some((item) => item.tableName === 'personal_api_key')).toBe(false)
		expect(
			metadata.indices.some(
				(index) =>
					index.isUnique &&
					index.where === `"type" = 'user'` &&
					index.columns.some((column) => column.propertyName === 'token')
			)
		).toBe(true)
		expect(metadata.findColumnWithPropertyName('revokedAt')?.isNullable).toBe(true)
		expect(metadata.columns.some((column) => column.propertyName === 'organizationId')).toBe(true)
	})
})
