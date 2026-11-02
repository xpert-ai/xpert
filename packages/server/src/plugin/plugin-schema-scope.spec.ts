import { DataSource, Entity, PrimaryColumn } from 'typeorm'
import { scopePluginSchemaSynchronization } from './plugin-schema-scope'

@Entity('plugin_owned_record')
class OwnedRecord {
	@PrimaryColumn('uuid') id: string
}

class MetadataDataSource extends DataSource {
	async prepareMetadata() {
		await this.buildMetadatas()
	}
}

describe('plugin DDL namespace boundary', () => {
	it.each([undefined, '', 'other'])(
		'rejects a missing or unrelated namespace before changing synchronization flags (%s)',
		async (namespace) => {
			const source = new MetadataDataSource({ type: 'postgres', entities: [OwnedRecord] })
			await source.prepareMetadata()
			expect(() => scopePluginSchemaSynchronization(source, [OwnedRecord], namespace)).toThrow()
			expect(source.getMetadata(OwnedRecord).synchronize).toBe(true)
		}
	)
})
