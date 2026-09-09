import { coreEntities } from '@xpert-ai/server-core'
import { DataSource } from 'typeorm'
import { XpertProjectInvitation, XpertProjectMembership } from './internal'
import { ALL_AI_ENTITIES } from '.'
import * as WikiEntities from '../../knowledgebase/wiki/entities'

class MetadataDataSource extends DataSource {
    buildMetadata() {
        return this.buildMetadatas()
    }
}

describe('ALL_AI_ENTITIES', () => {
    it('registers all Wiki entities for the standalone schema-sync command', () => {
        expect(ALL_AI_ENTITIES).toEqual(expect.arrayContaining(Object.values(WikiEntities)))
    })
    it('contains the Project collaboration entities and builds their relation metadata', async () => {
        const dataSource = new MetadataDataSource({
            type: 'postgres',
            database: 'xpert',
            entities: [...coreEntities, ...ALL_AI_ENTITIES]
        })

        await expect(dataSource.buildMetadata()).resolves.toBeUndefined()
        expect(ALL_AI_ENTITIES).toEqual(expect.arrayContaining([XpertProjectMembership, XpertProjectInvitation]))
    })
})
