import { DataSource } from 'typeorm'
import { coreEntities } from '../../core/entities'
import { PersonalApiKey } from './personal-api-key.entity'

class MetadataDataSource extends DataSource {
	buildSchemaMetadata() {
		return this.buildMetadatas()
	}
}

describe('Personal API key persistence registration', () => {
	it('builds the core schema without a database connection and excludes hashes from default selects', async () => {
		const source = new MetadataDataSource({ type: 'postgres', entities: coreEntities })
		await source.buildSchemaMetadata()
		const metadata = source.getMetadata(PersonalApiKey)
		expect(metadata.tableName).toBe('personal_api_key')
		expect(metadata.findColumnWithPropertyName('tokenHash')?.isSelect).toBe(false)
		expect(
			metadata.indices.some(
				(index) => index.isUnique && index.columns.some((column) => column.propertyName === 'tokenHash')
			)
		).toBe(true)
		expect(metadata.findRelationWithPropertyPath('user')?.onDelete).toBe('CASCADE')
		expect(metadata.columns.some((column) => column.propertyName === 'organizationId')).toBe(false)
	})
})
