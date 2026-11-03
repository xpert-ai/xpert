import { DataSource } from 'typeorm'
import { coreEntities } from '@xpert-ai/server-core'
import { ALL_AI_ENTITIES } from '../../core/entities'
import { Copilot } from '../copilot.entity'

class MetadataDataSource extends DataSource {
    buildMetadata() {
        return this.buildMetadatas()
    }
}

it('registers the nullable deletion marker and excludes deleted connections from normal ORM queries', async () => {
    const database = new MetadataDataSource({
        type: 'postgres',
        database: 'metadata-only',
        entities: [...coreEntities, ...ALL_AI_ENTITIES]
    })
    await database.buildMetadata()
    const metadata = database.getMetadata(Copilot)
    expect(metadata.deleteDateColumn).toMatchObject({ databaseName: 'deletedAt', isNullable: true })
    const sql = database.getRepository(Copilot).createQueryBuilder('connection').getSql()
    expect(sql).toContain('"connection"."deletedAt" IS NULL')
})
